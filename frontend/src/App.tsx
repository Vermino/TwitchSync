import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import Games from './pages/Games';
import VODs from './pages/VODs';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/games" element={<Games />} />
            <Route path="/vods" element={<VODs />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
