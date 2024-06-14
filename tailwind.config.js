/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        black: '#000',
        whitesmoke: '#f5f5f5',
        white: '#fff',
        darkslategray: {
          100: '#454545',
          200: '#393838',
          300: '#333', // added
        },
        darkgray: '#a1a0a0',
        gray: {
          100: '#1e1e1f',
          200: '#191919',
          300: '#0f0f0f',
          400: 'rgba(0, 0, 0, 0.4)',
        },
        gold: '#ffc700',
        dimgray: '#747474',
      },
      spacing: {
        'spacing-sm': '32px', // added
        'spacing-m': '48px', // added
      },
      fontFamily: {
        ubuntu: 'Ubuntu',
        orbitron: 'Orbitron',
      },
      borderRadius: {
        '8xs': '5px',
        '2xl-9': '21.9px',
        'base-1': '15.1px', // added
      },
      fontSize: {
        'smi-6': '0.788rem',
        '2xs-5': '0.656rem',
        inherit: 'inherit',
        base: '1rem', // added
        xl: '1.25rem', // added
        '5xl': '1.5rem', // added
        lgi: '1.188rem', // added
      },

      screens: {
        mq900: {
          raw: 'screen and (max-width: 900px)',
        },
        mq675: {
          raw: 'screen and (max-width: 675px)', // added
        },
        mq450: {
          raw: 'screen and (max-width: 450px)',
        },
      },
    },
  },
  corePlugins: {
    preflight: false,
    fontSize: true,
  },
};
