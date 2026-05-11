import { useDemoControls } from './useDemoControls'
import { useDurableChatApp } from './useDurableChatApp'

export function useChatApp() {
  const core = useDurableChatApp()
  const demo = useDemoControls(core)

  return {
    ...core,
    demo
  }
}

export type ChatApp = ReturnType<typeof useChatApp>
