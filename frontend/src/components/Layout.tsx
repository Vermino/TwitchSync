// frontend/src/components/Layout.tsx

import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  Users,
  Gamepad,
  CalendarClock,
  Video,
  LayoutDashboard,
  Settings,
  Menu,
  X,
  HardDrive
} from 'lucide-react';
import UserMenu from './UserMenu';

const Layout = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/discovery', label: 'Content Discovery', icon: Video },
    { path: '/channels', label: 'Channels', icon: Users },
    { path: '/games', label: 'Games', icon: Gamepad },
    { path: '/tasks', label: 'Task Manager', icon: CalendarClock },
    { path: '/storage', label: 'Storage Management', icon: HardDrive }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center">
              <Link
                to="/"
                className="flex items-center h-14 px-3 hover:bg-purple-700 transition-colors"
              >
                <img
                  src="/assets/twitch-sync-logo.png"
                  alt="TwitchSync"
                  className="h-8 w-auto"
                />
              </Link>

              {/* Desktop Navigation */}
              <div className="hidden md:flex space-x-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center px-3 h-14 gap-2 hover:bg-purple-700 transition-colors ${
                      isActive(item.path) ? 'bg-purple-700' : ''
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex items-center">
              <UserMenu />
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden ml-4"
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className={`md:hidden ${isMobileMenuOpen ? 'block' : 'hidden'}`}>
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center px-3 py-2 rounded-md gap-2 hover:bg-purple-700 transition-colors ${
                    isActive(item.path) ? 'bg-purple-700' : ''
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
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
