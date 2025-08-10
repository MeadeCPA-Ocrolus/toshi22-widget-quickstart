import { useEffect } from 'react';

declare global {
  interface Window {
    particlesJS: any;
  }
}

const ParticlesBackground = () => {
  useEffect(() => {
    // Wait for particles.js to load
    const initParticles = () => {
      if (window.particlesJS) {
        window.particlesJS('particles-js', {
          "particles": {
            "number": {
              "value": 300,
              "density": {
                "enable": true,
                "value_area": 900
              }
            },
            "color": {
              "value": "#287f43"
            },
            "shape": {
              "type": "circle"
            },
            "opacity": {
              "value": 0.8,
              "random": false
            },
            "size": {
              "value": 3,
              "random": true
            },
            "line_linked": {
              "enable": true,
              "distance": 150,
              "color": "#287f43",
              "opacity": 0.6,
              "width": 2
            },
            "move": {
              "enable": true,
              "speed": 3,
              "direction": "none",
              "random": false,
              "straight": false,
              "out_mode": "out"
            }
          },
          "interactivity": {
            "detect_on": "canvas",
            "events": {
              "onhover": {
                "enable": true,
                "mode": "grab"
              },
              "onclick": {
                "enable": true,
                "mode": "push"
              },
              "resize": true
            },
            "modes": {
              "grab": {
                "distance": 200,
                "line_linked": {
                  "opacity": 1
                }
              },
              "push": {
                "particles_nb": 4
              }
            }
          },
          "retina_detect": true
        });
      } else {
        // Retry if particles.js not loaded yet
        setTimeout(initParticles, 100);
      }
    };

    initParticles();
  }, []);

  return (
    <div 
      id="particles-js" 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        pointerEvents: 'none'
      }}
    />
  );
};

export default ParticlesBackground;