import "./globals.css";

export const metadata = {
  title: "JobWatch — Finance × IT",
  description: "Veille d'opportunités et suivi des candidatures"
};

export default function RootLayout({ children }) {
  return <html lang="fr"><body>{children}</body></html>;
}
