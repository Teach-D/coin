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
