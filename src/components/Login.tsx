import React, { useState, useEffect, useRef } from 'react';
import { Lock, User, ArrowRight, Loader2, Activity } from 'lucide-react';
import { cn } from '../utils/cn';
import { APP_VERSION, BUILD_DATE, BUILD_NUMBER } from '../version';

interface LoginProps {
  onLogin: (token: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Particle animation effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    
    const particles: { x: number; y: number; vx: number; vy: number; size: number; color: string }[] = [];
    const particleCount = 80;
    // Dark colors for light background: Slate-400, Blue-500, Cyan-600
    const colors = ['#94a3b8', '#3b82f6', '#0891b2', '#64748b']; 

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 0.5,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      
      // Draw connections
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particleCount; i++) {
        for (let j = i + 1; j < particleCount; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 150) {
            ctx.beginPath();
            // Darker lines for light background
            ctx.strokeStyle = `rgba(100, 116, 139, ${0.15 * (1 - distance / 150)})`;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Update and draw particles
      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(animate);
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }) // Password will be hashed/checked on backend
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '登录失败');
      }

      // Success
      onLogin(data.token || 'logged-in');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录出错');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center overflow-hidden bg-[#fdfbf7] text-slate-800">
      {/* Background Canvas */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 z-0 pointer-events-none opacity-60"
      />
      
      {/* Background Gradient Orbs - Light theme */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-100/50 blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-amber-100/50 blur-[100px] animate-pulse delay-1000"></div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md p-8 mx-4">
        <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 space-y-8 relative overflow-hidden group">
          
          {/* Decorative scanning line */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-1000"></div>
          
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 mb-4 shadow-lg shadow-blue-500/20 text-white">
              <Activity className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-800">
              结构监测数据分析系统
            </h1>
            <p className="text-slate-500 text-sm">
              Structural Monitoring Analytics System
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="relative group/input">
                <div className="absolute left-3 top-3.5 text-slate-400 group-focus-within/input:text-blue-500 transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="用户名 / Username"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
                  required
                />
              </div>

              <div className="relative group/input">
                <div className="absolute left-3 top-3.5 text-slate-400 group-focus-within/input:text-blue-500 transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密码 / Password"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-in fade-in slide-in-from-top-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full group relative flex items-center justify-center gap-2 bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 text-white py-3 rounded-xl font-medium transition-all shadow-lg shadow-slate-500/20 hover:shadow-slate-500/30 hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  登录系统
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center">
            <div className="text-xs text-slate-400 font-mono">
               v{APP_VERSION} ({BUILD_DATE} v{BUILD_NUMBER})
            </div>
            <div className="mt-1 text-[10px] text-slate-300 italic font-medium">
               By Surellc
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
