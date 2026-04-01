import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Slide = {
  title: string;
  subtitle: string;
  buttonText: string;
  image: string;
};

const slidesData: Slide[] = [
  {
    title: 'Master the Future with AI, Cloud & Cyber Skills',
    subtitle:
      'Upgrade your career with industry-focused programs in Artificial Intelligence, Data Science, Cloud Computing, Cyber Security, and Networking.',
    buttonText: 'Login to Start',
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=640&h=460&fit=crop',
  },
  {
    title: 'Learn Today. Lead Tomorrow.',
    subtitle:
      'Step into next-gen technology with guided internal learning, hands-on practice, and structured knowledge sharing for your team.',
    buttonText: 'Access Portal',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=640&h=460&fit=crop',
  },
  {
    title: 'Build In-Demand Tech Skills',
    subtitle:
      'From AI and cloud infrastructure to networking and security, employees can access curated internal content from a single place.',
    buttonText: 'Go to Login',
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=640&h=460&fit=crop',
  },
];

type ParticleShape = {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  radius: number;
  opacity: number;
};

export default function HeroCarousel() {
  const navigate = useNavigate();
  const slides = useMemo(() => slidesData, []);
  const [index, setIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mousePos = useRef({ x: -1000, y: -1000 });
  const particles = useRef<ParticleShape[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 520 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: 520,
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particleCount = 150;
    const mouseInfluence = 180;

    particles.current = Array.from({ length: particleCount }, () => {
      const baseX = Math.random() * dimensions.width;
      const baseY = Math.random() * dimensions.height;
      return {
        baseX,
        baseY,
        x: baseX,
        y: baseY,
        radius: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
      };
    });

    const animate = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      particles.current.forEach((p1, i) => {
        for (let j = i + 1; j < particles.current.length; j += 1) {
          const p2 = particles.current[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 100) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(227, 6, 19, ${0.15 * (1 - distance / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      particles.current.forEach((particle) => {
        const dx = mousePos.current.x - particle.x;
        const dy = mousePos.current.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < mouseInfluence) {
          const force = (mouseInfluence - distance) / mouseInfluence;
          const angle = Math.atan2(dy, dx);
          particle.x += Math.cos(angle) * force * 5;
          particle.y += Math.sin(angle) * force * 5;
        } else {
          particle.x += (particle.baseX - particle.x) * 0.05;
          particle.y += (particle.baseY - particle.y) * 0.05;
        }

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(227, 6, 19, ${particle.opacity})`;
        ctx.fill();
      });

      animationFrameId.current = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameId.current !== null) {
        window.cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [dimensions]);

  useEffect(() => {
    if (isHovering) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [isHovering, slides.length]);

  const go = (next: number) => {
    setIndex(((next % slides.length) + slides.length) % slides.length);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mousePos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const resetMouse = () => {
    mousePos.current = { x: -1000, y: -1000 };
  };

  return (
    <div className="relative overflow-hidden border-y border-red-100 bg-gradient-to-br from-white via-red-50 to-red-100 shadow-sm">
      <div
        className="relative h-[560px]"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => {
          setIsHovering(false);
          resetMouse();
        }}
        onMouseMove={handleMouseMove}
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="absolute inset-0 pointer-events-none"
        />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(255,255,255,0.6)_45%,rgba(254,242,242,0.7)_100%)]" />

        {slides.map((slide, i) => (
          <div
            key={slide.title}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === index ? 'z-10 opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div className="mx-auto grid h-full max-w-7xl items-center gap-8 px-6 py-10 md:grid-cols-[1.05fr_0.95fr] lg:px-10">
              <div className="relative z-10 max-w-2xl">
                <div className="mb-5 inline-flex rounded-full border border-red-200 bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-700 backdrop-blur">
                  Internal Learning Hub
                </div>
                <h1 className="mb-5 text-4xl font-bold leading-tight text-gray-900 sm:text-5xl md:text-6xl">
                  {slide.title.split(' ').map((word, idx) => {
                    const clean = word.replace(/[.,]/g, '');
                    const highlight = ['AI', 'Cloud', 'Cyber', 'Learn', 'Lead', 'Tech', 'Skills'].includes(clean);
                    return (
                      <span key={`${clean}-${idx}`} className={highlight ? 'text-red-700' : ''}>
                        {word}{' '}
                      </span>
                    );
                  })}
                </h1>
                <p className="mb-8 max-w-xl text-base leading-7 text-gray-700 md:text-lg">{slide.subtitle}</p>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="rounded-md bg-red-600 px-8 py-3 font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:bg-red-700"
                >
                  {slide.buttonText}
                </button>
              </div>

              <div className="relative z-10 hidden items-center justify-center md:flex">
                <img
                  src={slide.image}
                  alt="Hero visual"
                  className="h-[430px] w-full max-w-[620px] rounded-[28px] object-cover shadow-2xl"
                />
              </div>
            </div>
          </div>
        ))}

        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-3">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2.5 w-2.5 rounded-full border transition-colors ${
                i === index ? 'border-red-600 bg-red-600' : 'border-gray-300 bg-white/70 hover:bg-red-300'
              }`}
              onClick={() => go(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
