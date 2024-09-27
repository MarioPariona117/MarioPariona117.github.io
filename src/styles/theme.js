import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2', // A nice blue
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#ff4081', // A vibrant pink
      contrastText: '#ffffff',
    },
    background: {
      default: '#f4f6f8',
      // default: '#ecf2fa',
      paper: '#ffffff',
    },
    text: {
      primary: '#333333',
      secondary: '#555555',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
      color: '#1976d2',
      marginBottom: '16px',
    },
    h2: {
      fontWeight: 600,
      fontSize: '2rem',
      color: '#333333',
      marginBottom: '12px',
    },
    h3: {
      fontWeight: 500,
      fontSize: '1.75rem',
      color: '#333333',
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
      color: '#555555',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 20,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12, // Round edges for cards
          transition: '0.3s',
          '&:hover': {
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)', // Shadow on hover
          },
          backgroundColor: '#ecf2fa', // Light background for cards
        },
      },
    },
    MuiContainer: {
      styleOverrides: {
        root: {
          mt: 4,
          mb: 4,
          backgroundColor: '#ecf2fa', // Light background for containers
          padding: 4,
          borderRadius: 2, // Optional: rounded corners
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        h1: {
          marginBottom: '16px',
        },
        h2: {
          marginBottom: '12px',
        },
        body1: {
          marginBottom: '8px', // Add margin below body text
        },
      },
    },
  },
});

export default theme;