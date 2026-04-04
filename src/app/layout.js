import './globals.css';

export const metadata = {
  title: 'Invogue Collab HQ',
  description: 'Influencer Marketing Management System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Newsreader:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
