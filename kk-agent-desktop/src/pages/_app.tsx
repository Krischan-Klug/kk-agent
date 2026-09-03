import "@/styles/globals.css";
import { useEffect } from "react";
import type { AppProps } from "next/app";
import Layout from "@/components/Layout";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import ErrorToast from "@/components/ErrorToast";
import { initTheme } from "@/lib/themes";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <>
      <AppErrorBoundary>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </AppErrorBoundary>
      <ErrorToast />
    </>
  );
}
