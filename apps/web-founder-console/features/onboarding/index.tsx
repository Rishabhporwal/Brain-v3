'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconArrowLeft,
  IconArrowRight,
  IconBuildingStore,
  IconCheck,
  IconLoader2,
  IconPlugConnected,
  IconShoppingCart,
  IconUser,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { apiJson } from '@/lib/api/client'
import { ApiError } from '@/lib/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const STEPS = [
  { id: 'profile', label: 'Your profile', icon: IconUser },
  { id: 'brand', label: 'Your brand', icon: IconBuildingStore },
  { id: 'platform', label: 'Platform', icon: IconShoppingCart },
  { id: 'connect', label: 'Connect store', icon: IconPlugConnected },
] as const

const ROLES = [
  { value: 'founder', label: 'Founder / CEO', description: 'I run the business' },
  { value: 'marketing', label: 'Marketing', description: 'I manage growth & ads' },
  { value: 'analyst', label: 'Data / Analytics', description: 'I analyze performance' },
  { value: 'developer', label: 'Developer', description: 'I build & integrate' },
  { value: 'agency', label: 'Agency', description: 'I manage client brands' },
  { value: 'other', label: 'Other', description: 'Something else' },
]

const INDUSTRIES = [
  'Fashion & Apparel',
  'Beauty & Cosmetics',
  'Health & Wellness',
  'Food & Beverage',
  'Home & Garden',
  'Electronics',
  'Sports & Outdoors',
  'Toys & Games',
  'Pet Supplies',
  'Other',
]

const REVENUE_RANGES = [
  { value: 'pre-revenue', label: 'Pre-revenue' },
  { value: '0-10k', label: '₹0 – ₹10L/mo' },
  { value: '10k-50k', label: '₹10L – ₹50L/mo' },
  { value: '50k-200k', label: '₹50L – ₹2Cr/mo' },
  { value: '200k-1m', label: '₹2Cr – ₹10Cr/mo' },
  { value: '1m+', label: '₹10Cr+/mo' },
]

interface OnboardingProps {
  defaultFullName: string
  email: string
  isNewWorkspace?: boolean
}

export function Onboarding({ defaultFullName, email, isNewWorkspace = false }: OnboardingProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepsToShow = isNewWorkspace ? STEPS.slice(1) : STEPS
  const contentStep = isNewWorkspace ? step + 1 : step

  const [fullName, setFullName] = useState(defaultFullName)
  const [role, setRole] = useState('')
  const [brandName, setBrandName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [region, setRegion] = useState('IN')
  const [industry, setIndustry] = useState('')
  const [monthlyRevenue, setMonthlyRevenue] = useState('')

  const [platform, setPlatform] = useState<'shopify' | 'woocommerce' | ''>('')
  const [storeUrl, setStoreUrl] = useState('') // Shopify handle
  const [wcStoreUrl, setWcStoreUrl] = useState('')
  const [wcConsumerKey, setWcConsumerKey] = useState('')
  const [wcConsumerSecret, setWcConsumerSecret] = useState('')

  const effectiveSlug = slugTouched ? slug : toSlug(brandName)

  const canProceed = () => {
    if (contentStep === 0) return fullName.trim().length > 0 && role.length > 0
    if (contentStep === 1) return brandName.trim().length > 0 && effectiveSlug.trim().length > 0
    if (contentStep === 2) return platform !== ''
    return true
  }

  const handleNext = () => {
    if (step < stepsToShow.length - 1) {
      setStep(step + 1)
      setError(null)
    }
  }
  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1)
      setError(null)
    }
  }

  async function handleSubmit(connect: boolean) {
    setError(null)
    setPending(true)
    try {
      const result = await apiJson<{ shopifyAuthUrl?: string; redirectTo?: string; error?: string }>(
        '/api/onboarding/complete',
        {
          method: 'POST',
          body: JSON.stringify({
            fullName: fullName.trim(),
            role,
            brandName: brandName.trim(),
            slug: effectiveSlug.trim().toLowerCase(),
            region,
            industry,
            monthlyRevenue,
            platform: platform || 'shopify',
            storeUrl: storeUrl.trim(),
            connectShopify: platform === 'shopify' && connect,
            wcStoreUrl: wcStoreUrl.trim(),
            wcConsumerKey: wcConsumerKey.trim(),
            wcConsumerSecret: wcConsumerSecret.trim(),
          }),
        },
      )
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.shopifyAuthUrl) {
        window.location.href = result.shopifyAuthUrl // off to Shopify consent
        return
      }
      if (result.redirectTo) {
        router.push(result.redirectTo)
        return
      }
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? ((e.body as { message?: string })?.message ?? 'Onboarding failed')
          : 'Onboarding failed'
      setError(msg)
      if (/URL|handle|taken/i.test(msg)) setStep(isNewWorkspace ? 0 : 1)
    } finally {
      setPending(false)
    }
  }

  const hasWcCredentials =
    wcStoreUrl.trim().length > 0 && wcConsumerKey.trim().length > 0 && wcConsumerSecret.trim().length > 0

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isNewWorkspace ? 'Create a new workspace' : 'Welcome to Brain'}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isNewWorkspace ? 'Add another workspace to your account.' : "Let's get you set up in a few quick steps."}
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {stepsToShow.map((s, i) => {
            const Icon = s.icon
            const isActive = i === step
            const isCompleted = i < step
            return (
              <div key={s.id} className="flex items-center gap-2">
                {i > 0 && <div className={cn('h-px w-8 transition-colors', isCompleted ? 'bg-primary' : 'bg-border')} />}
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive && 'bg-primary text-primary-foreground',
                    isCompleted && 'bg-primary/10 text-primary cursor-pointer',
                    !isActive && !isCompleted && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isCompleted ? <IconCheck className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="bg-card rounded-xl border p-6 shadow-sm">
          {/* Profile */}
          {contentStep === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Tell us about yourself</h2>
                <p className="text-muted-foreground text-sm">This helps us personalize your experience.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" placeholder="Priya Sharma" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} disabled className="text-muted-foreground" />
              </div>
              <div className="grid gap-2">
                <Label>What&apos;s your role?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      className={cn(
                        'hover:bg-accent flex flex-col items-start rounded-lg border p-3 text-left transition-colors',
                        role === r.value ? 'border-primary bg-primary/5 ring-primary ring-1' : 'border-border',
                      )}
                    >
                      <span className="text-sm font-medium">{r.label}</span>
                      <span className="text-muted-foreground text-xs">{r.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Brand */}
          {contentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Set up your brand</h2>
                <p className="text-muted-foreground text-sm">We&apos;ll create a workspace for your brand&apos;s analytics.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="brandName">
                  Brand name <span className="text-destructive">*</span>
                </Label>
                <Input id="brandName" placeholder="Acme Skincare" value={brandName} onChange={(e) => setBrandName(e.target.value)} autoFocus />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">
                  Workspace URL <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center">
                  <span className="bg-muted text-muted-foreground flex h-9 items-center rounded-l-md border border-r-0 px-3 text-sm">
                    /w/
                  </span>
                  <Input
                    id="slug"
                    placeholder="acme-skincare"
                    className="rounded-l-none"
                    value={effectiveSlug}
                    onChange={(e) => {
                      setSlugTouched(true)
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                    }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">Lowercase letters, numbers, and hyphens only.</p>
              </div>
              <div className="grid gap-2">
                <Label>Region</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { code: 'IN', label: 'India', sub: 'INR' },
                    { code: 'AE', label: 'UAE', sub: 'AED' },
                    { code: 'SA', label: 'Saudi Arabia', sub: 'SAR' },
                  ].map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => setRegion(r.code)}
                      className={cn(
                        'hover:bg-accent rounded-lg border px-3 py-2 text-left transition-colors',
                        region === r.code ? 'border-primary bg-primary/5 ring-primary ring-1' : 'border-border',
                      )}
                    >
                      <div className="text-sm font-medium">{r.label}</div>
                      <div className="text-muted-foreground text-xs">{r.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Industry</Label>
                <div className="flex flex-wrap gap-1.5">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind}
                      type="button"
                      onClick={() => setIndustry(industry === ind ? '' : ind)}
                      className={cn(
                        'hover:bg-accent rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        industry === ind ? 'border-primary bg-primary/5 text-primary ring-primary ring-1' : 'border-border text-muted-foreground',
                      )}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Monthly revenue</Label>
                <div className="grid grid-cols-3 gap-2">
                  {REVENUE_RANGES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setMonthlyRevenue(monthlyRevenue === r.value ? '' : r.value)}
                      className={cn(
                        'hover:bg-accent rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                        monthlyRevenue === r.value ? 'border-primary bg-primary/5 text-primary ring-primary ring-1' : 'border-border text-muted-foreground',
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Platform */}
          {contentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">What platform is your store on?</h2>
                <p className="text-muted-foreground text-sm">Choose your ecommerce platform to connect your store.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    { id: 'shopify', name: 'Shopify', sub: 'Connect via OAuth', bg: 'bg-[#96bf48]/10' },
                    { id: 'woocommerce', name: 'WooCommerce', sub: 'WordPress / WooCommerce', bg: 'bg-[#7F54B3]/10' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className={cn(
                      'hover:bg-accent relative flex flex-col items-center gap-3 rounded-xl border p-6 text-center transition-colors',
                      platform === p.id ? 'border-primary bg-primary/5 ring-primary ring-2' : 'border-border',
                    )}
                  >
                    <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', p.bg)}>
                      <IconShoppingCart className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">{p.sub}</p>
                    </div>
                    {platform === p.id && (
                      <div className="bg-primary absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full">
                        <IconCheck className="text-primary-foreground h-3 w-3" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Connect — Shopify */}
          {contentStep === 3 && platform === 'shopify' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Connect your Shopify store</h2>
                <p className="text-muted-foreground text-sm">
                  Enter your store URL. You can also connect later from Settings → Integrations.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="onb-store-handle">Store URL</Label>
                <div className="flex items-center">
                  <Input
                    id="onb-store-handle"
                    placeholder="your-store"
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                    className="rounded-r-none"
                  />
                  <span className="bg-muted text-muted-foreground flex h-9 items-center rounded-r-md border border-l-0 px-3 text-sm">
                    .myshopify.com
                  </span>
                </div>
              </div>
              <p className="text-muted-foreground text-center text-xs">
                You can connect your store anytime from workspace settings.
              </p>
            </div>
          )}

          {/* Connect — WooCommerce */}
          {contentStep === 3 && platform === 'woocommerce' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Connect your WooCommerce store</h2>
                <p className="text-muted-foreground text-sm">Enter your store URL and REST API credentials.</p>
              </div>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="wc-store-url">Store URL</Label>
                  <Input id="wc-store-url" placeholder="https://mybrand.com" value={wcStoreUrl} onChange={(e) => setWcStoreUrl(e.target.value)} autoFocus />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="wc-consumer-key">Consumer Key</Label>
                  <Input id="wc-consumer-key" placeholder="ck_xxxxxxxxxxxx" value={wcConsumerKey} onChange={(e) => setWcConsumerKey(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="wc-consumer-secret">Consumer Secret</Label>
                  <Input id="wc-consumer-secret" type="password" placeholder="cs_xxxxxxxxxxxx" value={wcConsumerSecret} onChange={(e) => setWcConsumerSecret(e.target.value)} />
                </div>
              </div>
              <p className="bg-muted text-muted-foreground rounded-lg px-4 py-3 text-xs">
                Generate API keys in WordPress under <strong>WooCommerce → Settings → Advanced → REST API</strong>. Set permissions to <strong>Read</strong>.
              </p>
            </div>
          )}

          {error && <p className="text-destructive mt-4 text-sm">{error}</p>}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            {step > 0 ? (
              <Button variant="ghost" onClick={handleBack} disabled={pending}>
                <IconArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
            ) : (
              <div />
            )}

            {step < stepsToShow.length - 1 ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Continue
                <IconArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                {platform === 'shopify' && (
                  <>
                    <Button variant="ghost" onClick={() => handleSubmit(false)} disabled={pending}>
                      Skip for now
                    </Button>
                    <Button onClick={() => handleSubmit(true)} disabled={pending || storeUrl.trim().length === 0}>
                      {pending ? <IconLoader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                      Connect &amp; launch
                      <IconArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </>
                )}
                {platform === 'woocommerce' && (
                  <>
                    <Button variant="ghost" onClick={() => handleSubmit(false)} disabled={pending}>
                      Skip for now
                    </Button>
                    <Button onClick={() => handleSubmit(true)} disabled={pending || !hasWcCredentials}>
                      {pending ? <IconLoader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                      Connect &amp; launch
                      <IconArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </>
                )}
                {platform === '' && (
                  <Button onClick={() => handleSubmit(false)} disabled={pending}>
                    Launch
                    <IconArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
