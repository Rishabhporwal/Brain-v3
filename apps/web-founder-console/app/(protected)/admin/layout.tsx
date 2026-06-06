import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between border-b pb-3">
        <h2 className="text-lg font-semibold">Brain Admin</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">Exit admin</Link>
        </Button>
      </div>
      {children}
    </div>
  )
}
