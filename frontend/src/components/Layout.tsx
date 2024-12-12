import React from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  Users,
  Gamepad,
  Video,
  LayoutDashboard
} from 'lucide-react';
import UserMenu from './UserMenu';

const Layout = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/channels', label: 'Channels', icon: Users },
    { path: '/games', label: 'Games', icon: Gamepad },
    { path: '/vods', label: 'VODs', icon: Video }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-3 h-full gap-2 hover:bg-purple-700 transition-colors ${
                    isActive(item.path) ? 'bg-purple-700' : ''
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            <UserMenu />
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
