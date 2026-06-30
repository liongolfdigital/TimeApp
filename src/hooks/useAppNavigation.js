import { useCallback, useEffect, useState } from "react";
import {
  canAccessPage,
  defaultPageForUser,
} from "../auth/authorization";

function readRequestedPage(pageConfig) {
  const hashPage = window.location.hash.replace(/^#\/?/, "");
  const pathPage = window.location.pathname.replace(/^\/+/, "").split("/")[0];
  const requested = hashPage || pathPage;
  return pageConfig[requested] ? requested : "";
}

function pagePath(page) {
  return page === "attendance" ? "/" : `/${page}`;
}

/** Đồng bộ page nội bộ với History API và chặn route ngoài phạm vi quyền. */
export function useAppNavigation(currentUser, pageConfig) {
  const [activePage, setActivePage] = useState("attendance");
  const [accessDenied, setAccessDenied] = useState("");

  const resolveRoute = useCallback((user, { replace = false } = {}) => {
    if (!user) return;
    const requestedPage = readRequestedPage(pageConfig);
    const fallbackPage = defaultPageForUser(user);
    const nextPage = requestedPage || fallbackPage;

    if (canAccessPage(user, nextPage)) {
      setActivePage(nextPage);
      setAccessDenied("");
      if (replace && window.location.pathname !== pagePath(nextPage)) {
        window.history.replaceState({}, "", pagePath(nextPage));
      }
      return;
    }

    setActivePage(fallbackPage);
    setAccessDenied("Bạn không có quyền truy cập chức năng này");
    if (replace) window.history.replaceState({}, "", pagePath(fallbackPage));
  }, [pageConfig]);

  useEffect(() => {
    if (!currentUser) return undefined;
    resolveRoute(currentUser, { replace: true });
    const handlePopState = () => resolveRoute(currentUser);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentUser, resolveRoute]);

  const openPage = useCallback((page) => {
    if (!canAccessPage(currentUser, page)) {
      setAccessDenied("Bạn không có quyền truy cập chức năng này");
      setActivePage(defaultPageForUser(currentUser));
      return;
    }
    setAccessDenied("");
    setActivePage(page);
    window.history.pushState({}, "", pagePath(page));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentUser]);

  const navigateAfterLogin = useCallback((user) => {
    const nextPage = defaultPageForUser(user);
    setActivePage(nextPage);
    setAccessDenied("");
    window.history.replaceState({}, "", pagePath(nextPage));
  }, []);

  const resetNavigation = useCallback(() => {
    setAccessDenied("");
    setActivePage("attendance");
    window.history.replaceState({}, "", "/");
  }, []);

  return {
    accessDenied,
    activePage,
    navigateAfterLogin,
    openPage,
    resetNavigation,
  };
}
