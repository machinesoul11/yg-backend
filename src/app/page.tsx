import Link from 'next/link';
import { Button, Container, Card, CardHeader, CardTitle, CardDescription, Logo } from '@/components/ui';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-white via-brand-white-warm to-brand-cream">
      {/* Hero Section */}
      <section className="section pt-24">
        <Container>
          <div className="text-center max-w-4xl mx-auto flex flex-col items-center">
            <div className="mb-8 animate-fade-in">
              <Logo size="xl" priority />
            </div>
            <p className="font-display text-h2 md:text-display-sm text-brand-black mb-8 animate-fade-in animation-delay-100">
              Backend & Admin Services
            </p>
            <p className="text-body-lg text-gray-700 mb-12 animate-fade-in animation-delay-200 max-w-2xl mx-auto">
              Empowering creators, celebrating talent. The premium digital talent marketplace
              administration and backend services platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in animation-delay-300">
              <Link href="/admin/dashboard">
                <Button variant="primary" size="lg">
                  Admin Dashboard
                </Button>
              </Link>
              <Link href="/api/health">
                <Button variant="outline" size="lg">
                  API Health
                </Button>
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Features */}
      <section className="section">
        <Container>
          <div className="text-center mb-16">
            <h2 className="font-display text-display-sm text-brand-black mb-4">
              Platform Features
            </h2>
            <p className="text-body text-gray-600 max-w-2xl mx-auto">
              A comprehensive backend system designed for excellence
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card variant="hover">
              <CardHeader>
                <div className="w-12 h-12 bg-brand-gold rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-brand-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <CardTitle>Talent Management</CardTitle>
                <CardDescription>
                  Comprehensive creator profiles, licensing, and royalty tracking
                </CardDescription>
              </CardHeader>
            </Card>

            <Card variant="hover">
              <CardHeader>
                <div className="w-12 h-12 bg-brand-rose rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-brand-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <CardTitle>Payment Processing</CardTitle>
                <CardDescription>
                  Stripe integration, automated payouts, and financial reporting
                </CardDescription>
              </CardHeader>
            </Card>

            <Card variant="hover">
              <CardHeader>
                <div className="w-12 h-12 bg-brand-sage rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-brand-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <CardTitle>Secure Storage</CardTitle>
                <CardDescription>
                  Cloudflare R2 integration for media assets and content delivery
                </CardDescription>
              </CardHeader>
            </Card>

            <Card variant="hover">
              <CardHeader>
                <div className="w-12 h-12 bg-brand-gold rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-brand-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <CardTitle>Email Service</CardTitle>
                <CardDescription>
                  Branded transactional emails with Resend integration
                </CardDescription>
              </CardHeader>
            </Card>

            <Card variant="hover">
              <CardHeader>
                <div className="w-12 h-12 bg-brand-rose rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-brand-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <CardTitle>High Performance</CardTitle>
                <CardDescription>
                  Redis caching, connection pooling, and optimized queries
                </CardDescription>
              </CardHeader>
            </Card>

            <Card variant="hover">
              <CardHeader>
                <div className="w-12 h-12 bg-brand-sage rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-brand-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <CardTitle>Analytics</CardTitle>
                <CardDescription>
                  Comprehensive metrics, monitoring, and business intelligence
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </Container>
      </section>

      {/* Footer */}
      <footer className="border-t border-brand-cream bg-brand-black text-brand-white py-12 mt-24">
        <Container>
          <div className="text-center flex flex-col items-center">
            <div className="mb-6">
              <Logo size="md" />
            </div>
            <p className="text-body-sm italic font-display mb-6">
              The work is sacred. The creator is sovereign.
            </p>
            <p className="text-body-xs text-gray-400">
              © {new Date().getFullYear()} YES GODDESS. All rights reserved.
            </p>
          </div>
        </Container>
      </footer>
    </div>
  );
}
