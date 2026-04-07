import './globals.css';

export const metadata = {
  title: 'Invogue Collab HQ',
  description: 'Influencer Marketing Management System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
