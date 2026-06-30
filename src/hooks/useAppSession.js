import { useEffect, useState } from "react";
import { fetchCurrentUser, logout } from "../api/authApi";
import {
  clearAuthSession,
  getStoredAuthToken,
  getStoredAuthUser,
} from "../api/apiClient";

/** Khôi phục, xác minh và kết thúc phiên đăng nhập của app. */
export function useAppSession() {
  const [currentUser, setCurrentUser] = useState(getStoredAuthUser);
  const [isCheckingAuth, setIsCheckingAuth] = useState(Boolean(getStoredAuthToken()));

  useEffect(() => {
    if (!getStoredAuthToken()) {
      setIsCheckingAuth(false);
      return;
    }

    let active = true;
    fetchCurrentUser()
      .then((user) => {
        if (active) setCurrentUser(user);
      })
      .catch(() => {
        clearAuthSession();
        if (active) setCurrentUser(null);
      })
      .finally(() => {
        if (active) setIsCheckingAuth(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = (user) => {
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    await logout();
    setCurrentUser(null);
  };

  return {
    currentUser,
    handleLogin,
    handleLogout,
    isCheckingAuth,
  };
}
