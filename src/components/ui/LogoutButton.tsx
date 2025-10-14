'use client';

import { signOut } from 'next-auth/react';
import { Button } from './Button';

export function LogoutButton() {
  const handleLogout = async () => {
    await signOut({ callbackUrl: '/auth/signin' });
  };

  return (
    <Button 
      variant="outline" 
      size="sm"
      onClick={handleLogout}
      className="!text-brand-white !border-brand-white hover:!bg-brand-white hover:!text-brand-black"
    >
      Logout
    </Button>
  );
}
