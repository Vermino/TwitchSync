// frontend/src/components/Navbar.tsx

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Users,
  GamepadIcon,
  Video,
  CalendarClock,
  Settings,
  Menu
} from 'lucide-react';

const Navbar = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const navItems = [
    { path: '/discovery', icon: Video, text: 'Discovery Content' },
    { path: '/channels', icon: Users, text: 'Channels' },
    { path: '/games', icon: GamepadIcon, text: 'Games' },
    { path: '/tasks', icon: CalendarClock, text: 'Task Manager' },
    { path: '/settings', icon: Settings, text: 'Settings' }
  ];

  return (
    <nav className="bg-purple-900 text-white p-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link to="/" className="text-xl font-bold">TwitchSync</Link>

          <div className="hidden md:flex items-center space-x-6">
            {navItems.map(({ path, icon: Icon, text }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-2 py-2 px-3 rounded-lg transition-colors ${
                  isActive(path)
                    ? 'bg-purple-800 text-white'
                    : 'text-purple-200 hover:bg-purple-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{text}</span>
              </Link>
            ))}
          </div>
        </div>

        <button className="md:hidden">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden">
        <div className="px-2 pt-2 pb-3 space-y-1">
          {navItems.map(({ path, icon: Icon, text }) => (
            <Link
              key={path}
              to={path}
              className={`flex items-center space-x-2 py-2 px-3 rounded-lg transition-colors ${
                isActive(path)
                  ? 'bg-purple-800 text-white'
                  : 'text-purple-200 hover:bg-purple-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{text}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
