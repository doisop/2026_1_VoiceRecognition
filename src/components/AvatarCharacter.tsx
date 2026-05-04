import React from 'react';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'talking';

interface AvatarCharacterProps {
  state: AvatarState;
  className?: string;
}

const AvatarCharacter: React.FC<AvatarCharacterProps> = ({ state, className = '' }) => {
  // SVG points or segments for different expressions
  const getAvatarContent = () => {
    switch (state) {
      case 'talking':
        return (
          <g>
            <circle cx="100" cy="100" r="80" fill="#E0F2F1" stroke="#00897B" strokeWidth="4" />
            <circle cx="70" cy="85" r="8" fill="#333" />
            <circle cx="130" cy="85" r="8" fill="#333" />
            <ellipse cx="100" cy="130" rx="20" ry="15" fill="#C62828" /> {/* Open mouth */}
          </g>
        );
      case 'listening':
        return (
          <g>
            <circle cx="100" cy="100" r="80" fill="#FFFDE7" stroke="#FBC02D" strokeWidth="4" />
            <circle cx="70" cy="85" r="8" fill="#333" />
            <circle cx="130" cy="85" r="8" fill="#333" />
            <path d="M 80 130 Q 100 135 120 130" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" />
            <path d="M 30 90 Q 20 100 30 110" fill="none" stroke="#FBC02D" strokeWidth="3" />
            <path d="M 170 90 Q 180 100 170 110" fill="none" stroke="#FBC02D" strokeWidth="3" />
          </g>
        );
      case 'thinking':
        return (
          <g>
            <circle cx="100" cy="100" r="80" fill="#F3E5F5" stroke="#8E24AA" strokeWidth="4" />
            <path d="M 65 80 L 75 80" fill="none" stroke="#333" strokeWidth="3" />
            <path d="M 125 80 L 135 80" fill="none" stroke="#333" strokeWidth="3" />
            <path d="M 90 135 L 110 135" fill="none" stroke="#333" strokeWidth="2" />
            <circle cx="150" cy="40" r="5" fill="#8E24AA" />
            <circle cx="165" cy="25" r="8" fill="#8E24AA" />
          </g>
        );
      case 'idle':
      default:
        return (
          <g>
            <circle cx="100" cy="100" r="80" fill="#F5F5F5" stroke="#9E9E9E" strokeWidth="4" />
            <circle cx="70" cy="85" r="6" fill="#333" />
            <circle cx="130" cy="85" r="6" fill="#333" />
            <path d="M 85 130 Q 100 135 115 130" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" />
          </g>
        );
    }
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 200 200" className="w-64 h-64 md:w-80 md:h-80 drop-shadow-lg">
        {getAvatarContent()}
      </svg>
    </div>
  );
};

export default AvatarCharacter;
