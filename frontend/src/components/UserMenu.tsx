import React, { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { LogOut, Settings, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

const UserMenu = () => {
  const { user, twitchAccount, logout } = useAuth();

  return (
    <Menu as="div" className="relative ml-3">
      <Menu.Button className="flex items-center max-w-xs rounded-full bg-purple-700 text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-purple-700">
        <span className="sr-only">Open user menu</span>
        {twitchAccount?.profile_image_url ? (
          <img
            className="h-8 w-8 rounded-full"
            src={twitchAccount.profile_image_url}
            alt={twitchAccount.username}
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-purple-800 flex items-center justify-center">
            <User className="h-5 w-5 text-white" />
          </div>
        )}
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="px-4 py-2 border-b">
            <p className="text-sm font-medium text-gray-900">
              {twitchAccount?.username || user?.username}
            </p>
            {user?.email && (
              <p className="text-xs text-gray-500 truncate">
                {user.email}
              </p>
            )}
          </div>

          <Menu.Item>
            {({ active }) => (
              <Link
                to="/settings"
                className={`
                  flex items-center px-4 py-2 text-sm ${
                    active ? 'bg-gray-100' : ''
                  } text-gray-700
                `}
              >
                <Settings className="mr-3 h-4 w-4" />
                Settings
              </Link>
            )}
          </Menu.Item>

          <Menu.Item>
            {({ active }) => (
              <button
                onClick={logout}
                className={`
                  flex w-full items-center px-4 py-2 text-sm ${
                    active ? 'bg-gray-100' : ''
                  } text-gray-700
                `}
              >
                <LogOut className="mr-3 h-4 w-4" />
                Sign out
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
};

export default UserMenu;
