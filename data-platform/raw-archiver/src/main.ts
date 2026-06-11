import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { CompressionCodecs, CompressionTypes, Kafka, logLevel } from 'kafkajs'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SnappyCodec = require('kafkajs-snappy') // producers may compress (rpk defaults to snappy)
import { buildObjects, type RawMessage } from './archive'

CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec

/**
 * Raw archive consumer (BRD §10.4): subscribes to every live integration topic and writes each
 * batch to object storage exactly as received, BEFORE committing offsets (at-least-once — a
 * crash re-archives, never loses; ReplacingMergeTree-style dedup is the reader's concern via
 * offset coordinates in each line). Local: MinIO (S3-compatible); prod: S3 + Iceberg compaction
 * (data-platform/lakehouse, later).
 */
const TOPICS = (process.env.RAW_ARCHIVE_TOPICS ?? 'brain.integration.events,brain.integration.webhooks,brain.integration.pull')
  .split(',').map((t) => t.trim()).filter(Boolean)
const BUCKET = process.env.RAW_BUCKET ?? 'brain-raw'

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000', // MinIO local
  region: process.env.AWS_REGION ?? 'ap-south-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'brainadmin',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'brainadmin',
  },
})

async function main(): Promise<void> {
  // Minimal health server (K8s probes; operational-readiness baseline) — the archiver is otherwise headless.
  const { createServer } = await import('node:http')
  createServer((req, res) => {
    if (req.url === '/health' || req.url === '/healthz' || req.url === '/') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ service: 'raw-archiver', ok: true }))
    } else res.writeHead(404).end()
  }).listen(Number(process.env.RAW_ARCHIVER_PORT ?? 8080))

  await s3.send(new CreateBucketCommand({ Bucket: BUCKET })).catch(() => undefined) // idempotent local bootstrap

  const kafka = new Kafka({
    clientId: 'brain-raw-archiver',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(',').map((b) => b.trim()),
    logLevel: logLevel.WARN,
  })
  const consumer = kafka.consumer({ groupId: 'raw-archiver' })
  await consumer.connect()
  for (const topic of TOPICS) await consumer.subscribe({ topic, fromBeginning: true })

  await consumer.run({
    autoCommit: false, // commit only AFTER the batch is durably archived
    eachBatch: async ({ batch, resolveOffset, commitOffsetsIfNecessary, heartbeat }) => {
      const messages: RawMessage[] = batch.messages.map((m) => ({
        topic: batch.topic,
        partition: batch.partition,
        offset: m.offset,
        key: m.key ? m.key.toString('utf8') : null,
        timestamp: m.timestamp,
        value: m.value ? m.value.toString('utf8') : '',
      }))
      if (messages.length === 0) return
      for (const obj of buildObjects(messages)) {
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: obj.key, Body: obj.body, ContentType: 'application/x-ndjson' }))
        // eslint-disable-next-line no-console
        console.log(`archived ${obj.count} → s3://${BUCKET}/${obj.key}`)
      }
      resolveOffset(batch.messages[batch.messages.length - 1].offset)
      await commitOffsetsIfNecessary()
      await heartbeat()
    },
  })
}

void main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('raw-archiver fatal:', e)
  process.exit(1)
})
