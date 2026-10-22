import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Cursor } from '@/components/cursor'
import { SpaceBackground } from '@/components/space-background'
import { WillDoo } from '@/components/will-doo'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <SpaceBackground />
        <WillDoo />
        <App />
        <Toaster position="bottom-right" theme="dark" richColors />
        <Cursor />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
