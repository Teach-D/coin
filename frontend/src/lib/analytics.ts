import mixpanel from 'mixpanel-browser';

const token = import.meta.env.VITE_MIXPANEL_TOKEN as string | undefined;
const enabled = !!token;

if (enabled) {
  mixpanel.init(token!, {
    track_pageview: false,
    persistence: 'localStorage',
  });
}

export const analytics = {
  identify: (userId: string, props?: Record<string, unknown>) => {
    if (!enabled) return;
    const aliasKey = `mp_aliased_${userId}`;
    if (!localStorage.getItem(aliasKey)) {
      mixpanel.alias(userId);
      localStorage.setItem(aliasKey, '1');
    }
    mixpanel.identify(userId);
    if (props) mixpanel.people.set(props);
  },
  reset: () => {
    if (!enabled) return;
    mixpanel.reset();
  },
  track: (event: string, props?: Record<string, unknown>) => {
    if (!enabled) return;
    mixpanel.track(event, props);
  },
  page: (path: string) => {
    if (!enabled) return;
    mixpanel.track('Page Viewed', { path });
  },
};
