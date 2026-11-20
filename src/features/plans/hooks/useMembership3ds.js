import { useEffect, useRef, useState } from 'react';

export default function useMembership3ds(identity) {
  const current = useRef(null);
  const [authentication, setAuthentication] = useState(null);
  useEffect(() => () => {
    current.current?.abort();
    current.current = null;
  }, [identity]);

  function begin() {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    return {
      signal: controller.signal,
      onChallenge(active) {
        if (current.current === controller) setAuthentication(active ? { identity, controller } : null);
      },
    };
  }

  return {
    active: authentication?.identity === identity && !authentication.controller.signal.aborted,
    begin,
    cancel: () => current.current?.abort(),
  };
}
