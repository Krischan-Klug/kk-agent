import "@/styles/globals.css";
import { useEffect } from "react";
import type { AppProps } from "next/app";
import Layout from "@/components/Layout";
import { initTheme } from "@/lib/themes";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
