/**
 * Root Page - Backend/Admin Only
 * Redirects to admin dashboard
 */

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/admin/dashboard');
}
