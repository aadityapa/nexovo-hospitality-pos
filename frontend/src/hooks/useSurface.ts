import { useLocation } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { workspaceForRoles, type Workspace } from '@/config/workspace';
import { PHONE_SURFACE, routeSurface, surfaceClass, type RouteSurface, type Surface } from '@/config/surfaces';
import { useIsDesktop } from './useMediaQuery';

/**
 * Which audience is looking at this screen. Derived from the signed-in role, never from the URL —
 * see `config/workspace.ts` for why that distinction is load-bearing.
 */
export function useWorkspace(): Workspace {
  return workspaceForRoles(useAuthStore((s) => s.user)?.roles);
}

export interface ResolvedSurface {
  /** What the route asked for, after the viewport is taken into account. */
  surface: RouteSurface;
  /** Island class for the navigation rail, or undefined when it already matches the page. */
  shellClass?: string;
  /** Island class for the header and content region. */
  contentClass?: string;
  /** Whether the rail is painted dark, for the few controls that need to know (the brand glow). */
  shellIsDark: boolean;
  contentIsDark: boolean;
}

/**
 * Resolves the current route's declared surface against the active theme and the viewport.
 * See `config/surfaces.ts` for the declarations and the reasoning.
 */
export function useRouteSurface(): ResolvedSurface {
  const { pathname } = useLocation();
  const theme = useUiStore((s) => s.resolvedTheme) as Surface;
  const desktop = useIsDesktop();
  const workspace = useWorkspace();

  // Below lg the whole management shell is the phone application, which every board — admin and
  // manager alike — draws as ivory.
  const surface = desktop ? routeSurface(pathname, workspace) : PHONE_SURFACE;

  return {
    surface,
    shellClass: surfaceClass(surface.shell, theme),
    contentClass: surfaceClass(surface.content, theme),
    // In the light theme nothing is dark, whatever the route declared.
    shellIsDark: theme === 'dark' && surface.shell === 'dark',
    contentIsDark: theme === 'dark' && surface.content === 'dark',
  };
}
