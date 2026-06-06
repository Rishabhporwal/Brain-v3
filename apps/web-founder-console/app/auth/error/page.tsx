import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Suspense>
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Authentication error</CardTitle>
            <CardDescription>Something went wrong while signing you in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/auth/login">Try again</Link>
            </Button>
          </CardContent>
        </Card>
      </Suspense>
    </main>
  )
}
