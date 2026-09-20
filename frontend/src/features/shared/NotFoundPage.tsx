import { Link, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState, Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { homeForRoles } from '@/config/roleHome';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const home = user ? homeForRoles(user.roles) : '/login';
  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface p-6">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title="Page not found"
        description="This page doesn't exist, has moved, or isn't part of your role's workspace."
        action={
          <div className="flex flex-wrap gap-2 justify-center">
            <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
            <Link to={home}><Button>{user ? 'My dashboard' : 'Sign in'}</Button></Link>
          </div>
        }
      />
    </div>
  );
}
