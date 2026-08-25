/** Shared responsive layout classes for app screens and modals. */

export const APP_TOP_OFFSET = 'pt-14'

/** Fills AppNavShell; each screen scrolls itself when needed. */
export const APP_SHELL =
  'flex h-full min-h-0 w-full flex-col overflow-y-auto overflow-x-hidden bg-background'

/** Locked viewport shell for Game Day setup / lineup (no page scroll). */
export const APP_SHELL_LOCKED =
  'flex h-full min-h-0 w-full flex-col overflow-hidden bg-background'

export const APP_CONTAINER =
  'mx-auto w-full max-w-md px-4 sm:px-6 md:max-w-2xl lg:max-w-4xl'

export const APP_CONTAINER_TIGHT =
  'mx-auto w-full max-w-md px-4 sm:px-6 md:max-w-lg lg:max-w-xl'

/** Pitch on top / bench below on mobile; side-by-side from tablet up. */
export const PITCH_BENCH_LAYOUT =
  'grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] md:items-stretch lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px]'

/** Bench column: fills height; put overflow-y-auto on the inner player list. */
export const PITCH_BENCH_SIDEBAR =
  'flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden'

/** Live match still page-scrolls — cap bench height so it doesn't grow forever. */
export const PITCH_BENCH_SIDEBAR_CAPPED =
  'flex min-h-0 min-w-0 flex-col gap-4 max-h-[min(42vh,420px)] overflow-y-auto overscroll-contain md:max-h-[min(72vh,720px)]'

export const MODAL_OVERLAY =
  'fixed inset-0 z-[100] flex flex-col justify-end bg-background/80 p-0 backdrop-blur-sm md:items-center md:justify-center md:p-4'

export const MODAL_PANEL =
  'mx-auto flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border-t border-border bg-popover shadow-2xl md:max-h-[85vh] md:rounded-2xl md:border md:shadow-2xl'

export const TOUCH_ICON_BUTTON =
  'flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-lg active:scale-90'

export const TOUCH_ROW = 'min-h-11 touch-manipulation'
