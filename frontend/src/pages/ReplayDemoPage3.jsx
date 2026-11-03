import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function ReplayDemoPage3() {
  const navigate = useNavigate();

  useEffect(() => {
    api
      .replayLoadSession('2026-11-03')
      .then((status) => {
        if (status?.state === 'READY') {
          return api.replayPlay(1).then(() => navigate('/'));
        }
        navigate('/');
      })
      .catch(() => navigate('/'));
  }, [navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="card p-8 text-center">
        <p className="text-sm text-slate-300">Loading historical replay session…</p>
      </div>
    </div>
  );
}
