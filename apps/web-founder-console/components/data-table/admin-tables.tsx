'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { sampleRows } from '@/lib/charts/sample-data'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table/data-table'

const ROLES = ['Owner', 'Admin', 'Marketing Manager', 'Finance Manager', 'Operations Manager', 'Read Only']
const NAMES = [
  'Aarav Shah',
  'Diya Mehta',
  'Vivaan Rao',
  'Ananya Iyer',
  'Kabir Nair',
  'Isha Reddy',
  'Arjun Das',
  'Riya Bose',
]

type Member = { name: string; email: string; role: string; status: string }
export function MembersTable() {
  const data = sampleRows<Member>(6, (i, r) => ({
    name: NAMES[i],
    email: `${NAMES[i].split(' ')[0].toLowerCase()}@brand.com`,
    role: ROLES[i % ROLES.length],
    status: r(1) > 0.2 ? 'Active' : 'Invited',
  }))
  const columns: ColumnDef<Member, unknown>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'role', header: 'Role' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'Active' ? 'outline' : 'secondary'}>{row.original.status}</Badge>
      ),
    },
  ]
  return <DataTable columns={columns} data={data} />
}

type UserRow = { name: string; email: string; orgs: number; lastActive: string }
export function UsersTable() {
  const data = sampleRows<UserRow>(8, (i, r) => ({
    name: NAMES[i],
    email: `${NAMES[i].split(' ')[0].toLowerCase()}@brand.com`,
    orgs: 1 + Math.round(r(1) * 3),
    lastActive: `${1 + Math.round(r(2) * 20)}d ago`,
  }))
  const columns: ColumnDef<UserRow, unknown>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'orgs', header: 'Orgs' },
    { accessorKey: 'lastActive', header: 'Last active' },
  ]
  return <DataTable columns={columns} data={data} />
}

type WorkspaceRow = { name: string; org: string; plan: string; region: string; status: string }
export function WorkspacesTable() {
  const brands = ['Glow Co', 'FitFuel', 'UrbanThread', 'PureLeaf', 'NestHome', 'AuraBeauty']
  const data = sampleRows<WorkspaceRow>(6, (i, r) => ({
    name: brands[i],
    org: `${brands[i].split(' ')[0]} Group`,
    plan: ['Free', 'Growth', 'Scale', 'Enterprise'][Math.round(r(1) * 3)],
    region: ['IN', 'AE', 'SA'][Math.round(r(2) * 2)],
    status: r(3) > 0.15 ? 'Active' : 'Provisioning',
  }))
  const columns: ColumnDef<WorkspaceRow, unknown>[] = [
    { accessorKey: 'name', header: 'Workspace' },
    { accessorKey: 'org', header: 'Organization' },
    { accessorKey: 'plan', header: 'Plan' },
    { accessorKey: 'region', header: 'Region' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'Active' ? 'outline' : 'secondary'}>{row.original.status}</Badge>
      ),
    },
  ]
  return <DataTable columns={columns} data={data} />
}

type SyncRow = { connector: string; workspace: string; lastSync: string; lag: string; status: string }
export function SyncTable() {
  const conns = ['Shopify', 'Meta Ads', 'Google Ads', 'Shiprocket', 'Razorpay', 'WhatsApp']
  const data = sampleRows<SyncRow>(6, (i, r) => {
    const ok = r(1) > 0.25
    return {
      connector: conns[i],
      workspace: ['Glow Co', 'FitFuel', 'UrbanThread'][i % 3],
      lastSync: `${1 + Math.round(r(2) * 30)}m ago`,
      lag: `${Math.round(r(3) * 120)}s`,
      status: ok ? 'Healthy' : 'Degraded',
    }
  })
  const columns: ColumnDef<SyncRow, unknown>[] = [
    { accessorKey: 'connector', header: 'Connector' },
    { accessorKey: 'workspace', header: 'Workspace' },
    { accessorKey: 'lastSync', header: 'Last sync' },
    { accessorKey: 'lag', header: 'Lag' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'Healthy' ? 'outline' : 'destructive'}>{row.original.status}</Badge>
      ),
    },
  ]
  return <DataTable columns={columns} data={data} />
}
