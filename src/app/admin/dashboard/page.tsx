import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Container, Logo } from '@/components/ui';

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-brand-white-warm">
      {/* Header */}
      <header className="bg-brand-black border-b border-brand-gold">
        <Container>
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <Logo size="md" priority />
              <div>
                <p className="text-brand-white text-body-sm">Admin Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm">
                Settings
              </Button>
              <Button variant="primary" size="sm">
                New Creator
              </Button>
            </div>
          </div>
        </Container>
      </header>

      {/* Main Content */}
      <main className="py-12">
        <Container>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <Card variant="hover">
              <CardHeader>
                <CardDescription>Total Creators</CardDescription>
                <CardTitle>1,234</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="success">+12% this month</Badge>
              </CardContent>
            </Card>

            <Card variant="hover">
              <CardHeader>
                <CardDescription>Active Licenses</CardDescription>
                <CardTitle>5,678</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="gold">+8% this month</Badge>
              </CardContent>
            </Card>

            <Card variant="hover">
              <CardHeader>
                <CardDescription>Revenue</CardDescription>
                <CardTitle>$89,012</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="success">+15% this month</Badge>
              </CardContent>
            </Card>

            <Card variant="hover">
              <CardHeader>
                <CardDescription>Pending Payouts</CardDescription>
                <CardTitle>$12,345</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="warning">23 pending</Badge>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Recent Activity */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest platform updates and actions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { action: 'New creator registration', user: 'Sarah J.', time: '5 min ago', status: 'success' },
                      { action: 'License purchase', user: 'BrandCo', time: '12 min ago', status: 'success' },
                      { action: 'Payout processed', user: 'Alex M.', time: '1 hour ago', status: 'success' },
                      { action: 'Support ticket', user: 'Jordan P.', time: '2 hours ago', status: 'warning' },
                    ].map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-brand-white-warm rounded-lg">
                        <div>
                          <p className="font-medium text-brand-black">{item.action}</p>
                          <p className="text-body-sm text-gray-600">{item.user} • {item.time}</p>
                        </div>
                        <Badge variant={item.status as any}>
                          {item.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <div>
              <Card variant="gold">
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Button variant="primary" className="w-full">
                      Process Payouts
                    </Button>
                    <Button variant="secondary" className="w-full">
                      Review Reports
                    </Button>
                    <Button variant="outline" className="w-full">
                      Export Data
                    </Button>
                    <Button variant="ghost" className="w-full">
                      View Analytics
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>System Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm">API</span>
                      <Badge variant="success" size="sm">Operational</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm">Database</span>
                      <Badge variant="success" size="sm">Operational</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm">Storage</span>
                      <Badge variant="success" size="sm">Operational</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm">Email Service</span>
                      <Badge variant="success" size="sm">Operational</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </Container>
      </main>

      {/* Footer */}
      <footer className="border-t border-brand-cream bg-brand-white py-8 mt-12">
        <Container>
          <div className="text-center">
            <p className="text-body-sm text-gray-600 italic font-display">
              The work is sacred. The creator is sovereign.
            </p>
            <p className="text-body-xs text-gray-500 mt-2">
              © {new Date().getFullYear()} YES GODDESS. All rights reserved.
            </p>
          </div>
        </Container>
      </footer>
    </div>
  );
}
