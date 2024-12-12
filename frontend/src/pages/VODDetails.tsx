import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Eye, Calendar, ArrowLeft, Video } from 'lucide-react';
import VODChapters from '@/components/VODChapters';
import { api } from '@/lib/api';
import type { VODWithChapters, Chapter } from '@/types';

const VODDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vod, setVod] = useState<VODWithChapters | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVODDetails = async () => {
      try {
        const [vodData, chaptersData] = await Promise.all([
          api.getVOD(parseInt(id!)),
          api.getVODChapters(parseInt(id!))
        ]);
        setVod(vodData);
        setChapters(chaptersData);
        setError(null);
      } catch (err) {
        setError(api.handleError(err));
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchVODDetails();
    }
  }, [id]);

  const handleReanalyze = async () => {
    if (!vod) return;

    try {
      setAnalyzing(true);
      await api.reanalyzeVOD(vod.id);
      const newChapters = await api.getVODChapters(vod.id);
      setChapters(newChapters);
      setError(null);
    } catch (err) {
      setError(api.handleError(err));
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">VOD Details</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading VOD details...</div>
        </div>
      </div>
    );
  }

  if (!vod) {
    return (
      <div className="p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          VOD not found
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <button
        onClick={() => navigate('/vods')}
        className="mb-4 flex items-center text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to VODs
      </button>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {vod.thumbnail_url && (
          <img
            src={vod.thumbnail_url}
            alt={vod.title}
            className="w-full h-64 object-cover"
          />
        )}

        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">{vod.title}</h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="flex items-center text-gray-600">
              <Calendar className="w-5 h-5 mr-2" />
              {new Date(vod.created_at).toLocaleDateString()}
            </div>

            <div className="flex items-center text-gray-600">
              <Clock className="w-5 h-5 mr-2" />
              {vod.duration}
            </div>

            <div className="flex items-center text-gray-600">
              <Eye className="w-5 h-5 mr-2" />
              {vod.view_count.toLocaleString()} views
            </div>
          </div>

          {vod.channel_name && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Channel</h2>
              <div className="flex items-center text-gray-600">
                <Video className="w-5 h-5 mr-2" />
                {vod.channel_name}
              </div>
            </div>
          )}

          <VODChapters
            chapters={chapters}
            onReanalyze={handleReanalyze}
            isAnalyzing={analyzing}
          />

          <div className="mt-6">
            <a
              href={vod.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
            >
              Watch on Twitch
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VODDetails;
