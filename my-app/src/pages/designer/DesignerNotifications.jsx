import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Notifications are shown inline in the dashboard.
// This route just redirects back with the notifications tab active.
export default function DesignerNotifications() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/designer/dashboard", { replace: true, state: { tab: "notifications" } });
  }, [navigate]);
  return null;
}
