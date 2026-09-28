import { useLocation } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { workspaceForRoles, type Workspace } from '@/config/workspace';
import { routeSurface, surfaceClass, type RouteSurface, type Surface } from '@/config/surfaces';

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
  const workspace = useWorkspace();

  /*
   * The route's surface holds at EVERY width. There used to be a "phones are ivory" rule here —
   * below `lg` the whole management shell was painted paper because the earlier reference boards
   * drew their phone mock-ups that way. It produced exactly the defect a later audit reported:
   * "dark-mobile captures displaying light surfaces". A theme the operator chose is a theme; it
   * does not switch itself off because the window got narrow. The rule is gone, and the phone
   * shows whatever the route and the theme say.
   */
  const surface = routeSurface(pathname, workspace);

  return {
    surface,
    shellClass: surfaceClass(surface.shell, theme),
    contentClass: surfaceClass(surface.content, theme),
    // In the light theme nothing is dark, whatever the route declared.
    shellIsDark: theme === 'dark' && surface.shell === 'dark',
    contentIsDark: theme === 'dark' && surface.content === 'dark',
  };
}
