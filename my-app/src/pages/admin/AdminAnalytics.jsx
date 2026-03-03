import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { isVPSMode } from "../../config/backend";
import { getLeanMetrics, getLeanMetricsFromFirebase, getDashboardOverview } from "../../services/analyticsService";
import { getAllUsers } from "../../services/userService";
import "../../styles/admin.css";
import {
  TrendingUp,
  Users,
  FileImage,
  Eye,
  Download,
  Heart,
  Clock,
  Activity,
  BarChart3,
  PieChart,
  Calendar,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  ArrowLeft,
  Target,
  Repeat,
  Zap,
  UserCheck,
  Cloud,
  Database,
} from "lucide-react";

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState("7days"); // 7days, 30days, 90days, all
  
  // Default lean metrics structure to prevent undefined errors
  const defaultLeanMetrics = {
    totalVisitors: 0,
    uniqueVisitors: 0,
    totalPhotosTaken: 0,
    totalDownloads: 0,
    totalShares: 0,
    conversionRate: 0,
    topFrames: [],
    dailyStats: [],
    dailyActiveUsers: 0,
    weeklyActiveUsers: 0,
    monthlyActiveUsers: 0,
    funnel: {
      visit: 0,
      frameView: 0,
      frameSelect: 0,
      photoTaken: 0,
      downloaded: 0,
    },
    conversionRates: {
      viewToSelect: 0,
      selectToCapture: 0,
      captureToDownload: 0,
      overallConversion: 0,
    },
    registeredUsers: 0,
    registrationRate: 0,
    registrations7Days: 0,
    previousRegistrations7Days: 0,
    avgDownloadsPerUser: 0,
    topCreators: [],
  };
  
  const [leanMetrics, setLeanMetrics] = useState(defaultLeanMetrics);
  const [registrationData, setRegistrationData] = useState({
    totalUsers: 0,
    newUsersInPeriod: 0,
    activeUsers: 0,
    newUsersToday: 0,
  });
  const [analytics, setAnalytics] = useState({
    overview: {
      totalViews: 0,
      totalDownloads: 0,
      totalLikes: 0,
      totalFrames: 0,
      totalUsers: 0,
      totalKreators: 0,
    },
    trends: {
      viewsTrend: 0,
      downloadsTrend: 0,
      likesTrend: 0,
      usersTrend: 0,
    },
    topFrames: [],
    topUsers: [],
    categoryStats: [],
    recentActivity: [],
  });

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    
    // Load Lean Startup Metrics from API/Firebase
    let metrics = null;
    try {
      metrics = await getLeanMetricsFromFirebase();
      // Merge with defaults to ensure all properties exist
      setLeanMetrics({
        ...defaultLeanMetrics,
        ...metrics,
        funnel: {
          ...defaultLeanMetrics.funnel,
          ...(metrics?.funnel || {}),
        },
        conversionRates: {
          ...defaultLeanMetrics.conversionRates,
          ...(metrics?.conversionRates || {}),
        },
      });
      console.log("📊 Loaded metrics:", metrics);
    } catch (error) {
      console.error("Error loading metrics:", error);
      // Use defaults on error
      setLeanMetrics(defaultLeanMetrics);
    }
    
    // In VPS mode, skip localStorage loading - we get data from API
    if (isVPSMode()) {
      // Fetch registration data from backend
      try {
        const days = timeRange === '7days' ? 7 : timeRange === '30days' ? 30 : timeRange === '90days' ? 90 : 365;
        const overview = await getDashboardOverview(days);
        const totalUsers = parseInt(overview.total_users) || 0;
        const newUsers = parseInt(overview.new_users) || 0;
        const activeUsers = parseInt(overview.active_users) || 0;
        const signupsToday = parseInt(overview.signups_today) || 0;
        setRegistrationData({
          totalUsers,
          newUsersInPeriod: newUsers,
          activeUsers,
          newUsersToday: signupsToday,
        });
        setAnalytics(prev => ({
          ...prev,
          overview: {
            ...prev.overview,
            totalUsers,
          },
        }));
      } catch (err) {
        console.error("Failed to fetch registration stats:", err);
      }
      setLoading(false);
      return;
    }
    
    // Load REAL data from localStorage (non-VPS mode)
    const customFrames = JSON.parse(
        localStorage.getItem("custom_frames") || "[]"
      );
      const frameUsage = JSON.parse(
        localStorage.getItem("frame_usage") || "[]"
      );
      const users = JSON.parse(localStorage.getItem("users") || "[]");
      const activities = JSON.parse(
        localStorage.getItem("recent_activities") || "[]"
      );

      // Calculate totals
      const totalViews = frameUsage.reduce(
        (sum, usage) => sum + (usage.views || 0),
        0
      );
      const totalDownloads = frameUsage.reduce(
        (sum, usage) => sum + (usage.downloads || 0),
        0
      );
      const totalLikes = frameUsage.reduce(
        (sum, usage) => sum + (usage.likes || 0),
        0
      );

      // Calculate top frames
      const frameStats = {};
      frameUsage.forEach((usage) => {
        if (!frameStats[usage.frameId]) {
          const frame = customFrames.find((f) => f.id === usage.frameId);
          frameStats[usage.frameId] = {
            id: usage.frameId,
            name: frame?.name || `Frame ${usage.frameId}`,
            kreator: frame?.kreatorName || "Unknown",
            views: 0,
            downloads: 0,
            likes: 0,
          };
        }
        frameStats[usage.frameId].views += usage.views || 0;
        frameStats[usage.frameId].downloads += usage.downloads || 0;
        frameStats[usage.frameId].likes += usage.likes || 0;
      });

      const topFrames = Object.values(frameStats)
        .sort((a, b) => b.views - a.views)
        .slice(0, 3);

      // Calculate top users
      const userStats = {};
      frameUsage.forEach((usage) => {
        if (!userStats[usage.userId]) {
          const user = users.find((u) => u.id === usage.userId);
          userStats[usage.userId] = {
            id: usage.userId,
            name: user?.name || `User ${usage.userId}`,
            email: user?.email || "",
            framesUsed: 0,
            totalViews: 0,
            lastActive: user?.lastActive || "Unknown",
          };
        }
        userStats[usage.userId].framesUsed += 1;
        userStats[usage.userId].totalViews += usage.views || 0;
      });

      const topUsers = Object.values(userStats)
        .sort((a, b) => b.framesUsed - a.framesUsed)
        .slice(0, 3);

      // Calculate category stats
      const categoryStats = {};
      customFrames.forEach((frame) => {
        const category = frame.category || "Other";
        if (!categoryStats[category]) {
          categoryStats[category] = { category, frames: 0, views: 0 };
        }
        categoryStats[category].frames += 1;

        // Sum views for this frame
        const frameViews = frameUsage
          .filter((usage) => usage.frameId === frame.id)
          .reduce((sum, usage) => sum + (usage.views || 0), 0);
        categoryStats[category].views += frameViews;
      });

      const totalCategoryViews = Object.values(categoryStats).reduce(
        (sum, cat) => sum + cat.views,
        0
      );
      const categoryStatsArray = Object.values(categoryStats)
        .map((cat) => ({
          ...cat,
          percentage:
            totalCategoryViews > 0
              ? Math.round((cat.views / totalCategoryViews) * 100)
              : 0,
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 5);

      // Get recent activities
      const recentActivity = activities.slice(0, 10).map((activity) => ({
        type: activity.type || "view",
        user: activity.userName || `User ${activity.userId}`,
        frame: activity.frameName || `Frame ${activity.frameId}`,
        time: activity.time || "Just now",
      }));

      // Get unique users from frame_usage (more accurate than users array)
      const uniqueUserIds = new Set(frameUsage.map(u => u.userId));
      const actualUserCount = metrics?.totalUsers || uniqueUserIds.size;

      setAnalytics({
        overview: {
          totalViews,
          totalDownloads,
          totalLikes,
          totalFrames: customFrames.length,
          totalUsers: actualUserCount,
        },
        trends: {
          viewsTrend: metrics?.userGrowthRate || 0,
          downloadsTrend: 0,
          likesTrend: 0,
          usersTrend: metrics?.userGrowthRate || 0,
        },
        topFrames,
        topUsers,
        categoryStats: categoryStatsArray,
        recentActivity,
      });
      setLoading(false);
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const getTrendIcon = (trend) => {
    if (trend > 0) return <ArrowUp size={16} />;
    if (trend < 0) return <ArrowDown size={16} />;
    return <Minus size={16} />;
  };

  const getTrendColor = (trend) => {
    if (trend > 0) return "#22c55e";
    if (trend < 0) return "#ef4444";
    return "#6b7280";
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              display: "inline-block",
              width: "48px",
              height: "48px",
              border: "4px solid #f3f4f6",
              borderTop: "4px solid var(--accent)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: "16px",
            }}
          ></div>
          <p style={{ color: "var(--text-secondary)" }}>Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, #fdf7f4 0%, #fff 50%, #f7f1ed 100%)",
        minHeight: "100vh",
        padding: "32px 0 48px",
      }}
    >
      <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "0 16px" }}>
        {/* VPS Mode Banner */}
        {isVPSMode() && (
          <div className="admin-alert" style={{ background: "#e0f2fe", borderColor: "#0ea5e9" }}>
            <Database size={24} className="admin-alert-icon" style={{ color: "#0284c7" }} />
            <div>
              <h3 className="admin-alert-title" style={{ color: "#0369a1" }}>
                VPS Mode - PostgreSQL Database
              </h3>
              <p className="admin-alert-message" style={{ color: "#0369a1" }}>
                Analytics data is stored on your VPS server with PostgreSQL.
              </p>
            </div>
          </div>
        )}

        {/* Back Button */}
        <button
          onClick={() => navigate("/admin")}
          className="admin-button-secondary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
            padding: "10px 16px",
          }}
        >
          <ArrowLeft size={18} />
          Kembali ke Dashboard
        </button>

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: "clamp(22px, 4vw, 34px)",
                  fontWeight: "800",
                  color: "#222",
                  margin: "0 0 8px",
                }}
              >
                Analytics Dashboard
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>
                Track performance metrics and user engagement
              </p>
            </div>

            {/* Time Range Selector */}
            <div style={{ display: "flex", gap: "8px" }}>
              {[
                { value: "7days", label: "7 Days" },
                { value: "30days", label: "30 Days" },
                { value: "90days", label: "90 Days" },
                { value: "all", label: "All Time" },
              ].map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  style={{
                    padding: "8px 16px",
                    background:
                      timeRange === range.value ? "var(--accent)" : "white",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: timeRange === range.value ? "white" : "#222",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* User Registration Stats Section */}
        <div
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "32px",
            color: "white",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <Users size={24} style={{ color: "white" }} />
            <h2 style={{ fontSize: "18px", fontWeight: "700", margin: 0 }}>Registrasi User</h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "16px",
            }}
          >
            {/* Total registered */}
            <div
              style={{
                background: "rgba(255,255,255,0.15)",
                borderRadius: "12px",
                padding: "16px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "36px", fontWeight: "800", lineHeight: 1 }}>
                {formatNumber(
                  isVPSMode()
                    ? registrationData.totalUsers
                    : analytics.overview.totalUsers
                )}
              </div>
              <div style={{ fontSize: "13px", opacity: 0.9, marginTop: "6px" }}>Total Pengguna Terdaftar</div>
            </div>

            {/* New users in selected period */}
            <div
              style={{
                background: "rgba(255,255,255,0.15)",
                borderRadius: "12px",
                padding: "16px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "36px", fontWeight: "800", lineHeight: 1 }}>
                {formatNumber(
                  isVPSMode()
                    ? registrationData.newUsersInPeriod
                    : 0
                )}
              </div>
              <div style={{ fontSize: "13px", opacity: 0.9, marginTop: "6px" }}>
                Daftar Baru (
                {timeRange === "7days"
                  ? "7 Hari"
                  : timeRange === "30days"
                  ? "30 Hari"
                  : timeRange === "90days"
                  ? "90 Hari"
                  : "Semua Waktu"})
              </div>
            </div>

            {/* Active users in period */}
            <div
              style={{
                background: "rgba(255,255,255,0.15)",
                borderRadius: "12px",
                padding: "16px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "36px", fontWeight: "800", lineHeight: 1 }}>
                {formatNumber(
                  isVPSMode()
                    ? registrationData.activeUsers
                    : leanMetrics?.weeklyActiveUsers || 0
                )}
              </div>
              <div style={{ fontSize: "13px", opacity: 0.9, marginTop: "6px" }}>User Aktif (Periode)</div>
            </div>

            {/* Registration rate */}
            <div
              style={{
                background: "rgba(255,255,255,0.15)",
                borderRadius: "12px",
                padding: "16px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "36px", fontWeight: "800", lineHeight: 1 }}>
                {isVPSMode() && registrationData.totalUsers > 0
                  ? `${Math.round(
                      (registrationData.newUsersInPeriod /
                        registrationData.totalUsers) *
                        100
                    )}%`
                  : leanMetrics?.totalUsers > 0
                  ? `${Math.round(
                      (analytics.overview.totalUsers / leanMetrics.totalUsers) *
                        100
                    )}%`
                  : "0%"}
              </div>
              <div style={{ fontSize: "13px", opacity: 0.9, marginTop: "6px" }}>Tingkat Pertumbuhan</div>
            </div>
          </div>
        </div>

        {/* Overview Stats - Registered Users & Registration Rate */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            marginBottom: "32px",
            maxWidth: "520px",
          }}
        >
          <MetricCard
            icon={<Users size={24} />}
            label="Registered Users"
            value={formatNumber(isVPSMode() ? registrationData.totalUsers : analytics.overview.totalUsers)}
            trend={analytics.trends.usersTrend}
            color="#10b981"
          />
          <MetricCard
            icon={<UserCheck size={24} />}
            label="Registration Rate"
            value={leanMetrics?.totalUsers > 0 
              ? `${Math.round((analytics.overview.totalUsers / leanMetrics.totalUsers) * 100)}%`
              : "0%"
            }
            subtitle={`${analytics.overview.totalUsers} dari ${leanMetrics?.totalUsers || 0} visitors`}
            color="#8b5cf6"
          />
        </div>

        {/* LEAN STARTUP METRICS */}
        {leanMetrics && (
          <>
            {/* Section Header */}
            <div style={{ marginBottom: "20px", marginTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ 
                  fontSize: "20px", 
                  fontWeight: "700", 
                  color: "#222",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <Target size={20} style={{ color: "var(--accent)" }} />
                  Lean Startup Metrics
                </h2>
                {/* Data Source Indicator */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  background: leanMetrics.source === 'firebase' ? "#dcfce7" : "#fef3c7",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: leanMetrics.source === 'firebase' ? "#166534" : "#92400e",
                }}>
                  {leanMetrics.source === 'firebase' ? (
                    <>
                      <Cloud size={14} />
                      Data dari Firebase (Semua User)
                    </>
                  ) : (
                    <>
                      <Database size={14} />
                      Data Lokal (Hanya Browser Ini)
                    </>
                  )}
                </div>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                Actionable metrics untuk pengambilan keputusan
              </p>
            </div>

            {/* Lean Metrics Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              {/* Activation Rate */}
              <div className="admin-card" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ 
                  width: "48px", 
                  height: "48px", 
                  background: "#dcfce7", 
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px"
                }}>
                  <Zap size={24} style={{ color: "#22c55e" }} />
                </div>
                <div style={{ fontSize: "28px", fontWeight: "800", color: "#222" }}>
                  {leanMetrics.activationRate}%
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Activation Rate
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "8px" }}>
                  {leanMetrics.activatedUsers} dari {leanMetrics.totalUsers} user download
                </div>
              </div>

              {/* Retention Rate */}
              <div className="admin-card" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ 
                  width: "48px", 
                  height: "48px", 
                  background: "#dbeafe", 
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px"
                }}>
                  <Repeat size={24} style={{ color: "#3b82f6" }} />
                </div>
                <div style={{ fontSize: "28px", fontWeight: "800", color: "#222" }}>
                  {leanMetrics.retentionRate}%
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  7-Day Retention
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "8px" }}>
                  {leanMetrics.returningUsers} user kembali
                </div>
              </div>

              {/* Growth Rate */}
              <div className="admin-card" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ 
                  width: "48px", 
                  height: "48px", 
                  background: leanMetrics.userGrowthRate >= 0 ? "#dcfce7" : "#fee2e2", 
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px"
                }}>
                  <TrendingUp size={24} style={{ color: leanMetrics.userGrowthRate >= 0 ? "#22c55e" : "#ef4444" }} />
                </div>
                <div style={{ 
                  fontSize: "28px", 
                  fontWeight: "800", 
                  color: leanMetrics.userGrowthRate >= 0 ? "#22c55e" : "#ef4444" 
                }}>
                  {leanMetrics.userGrowthRate >= 0 ? "+" : ""}{leanMetrics.userGrowthRate}%
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Weekly Growth
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "8px" }}>
                  {leanMetrics.newUsersThisWeek} new vs {leanMetrics.newUsersLastWeek} last week
                </div>
              </div>

              {/* Downloads per User */}
              <div className="admin-card" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ 
                  width: "48px", 
                  height: "48px", 
                  background: "#fae8ff", 
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px"
                }}>
                  <UserCheck size={24} style={{ color: "#a855f7" }} />
                </div>
                <div style={{ fontSize: "28px", fontWeight: "800", color: "#222" }}>
                  {leanMetrics.downloadsPerUser}
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Downloads/User
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "8px" }}>
                  Engagement metric
                </div>
              </div>
            </div>

            {/* Conversion Funnel */}
            <div className="admin-card" style={{ padding: "24px", marginBottom: "24px" }}>
              <h3 style={{ 
                fontSize: "16px", 
                fontWeight: "700", 
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <BarChart3 size={18} style={{ color: "var(--accent)" }} />
                Conversion Funnel (7 Hari Terakhir)
              </h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[
                  { label: "Visitors", value: leanMetrics.funnel.visit, color: "#3b82f6" },
                  { label: "Frame Views", value: leanMetrics.funnel.frameView, color: "#8b5cf6" },
                  { label: "Frame Selected", value: leanMetrics.funnel.frameSelect, color: "#ec4899" },
                  { label: "Photo Taken", value: leanMetrics.funnel.photoTaken, color: "#f97316" },
                  { label: "Downloaded", value: leanMetrics.funnel.downloaded, color: "#22c55e" },
                ].map((stage, index, arr) => {
                  const maxValue = Math.max(...arr.map(s => s.value), 1);
                  const percentage = maxValue > 0 ? Math.round((stage.value / maxValue) * 100) : 0;
                  const dropOff = index > 0 && arr[index - 1].value > 0 
                    ? Math.round(((arr[index - 1].value - stage.value) / arr[index - 1].value) * 100) 
                    : 0;
                  
                  return (
                    <div key={stage.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "500" }}>{stage.label}</span>
                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                          {index > 0 && dropOff > 0 && (
                            <span style={{ fontSize: "11px", color: "#ef4444" }}>
                              -{dropOff}% drop
                            </span>
                          )}
                          <span style={{ fontSize: "13px", fontWeight: "600" }}>{stage.value}</span>
                        </div>
                      </div>
                      <div style={{ 
                        height: "8px", 
                        background: "#f3f4f6", 
                        borderRadius: "4px",
                        overflow: "hidden"
                      }}>
                        <div style={{ 
                          height: "100%", 
                          width: `${percentage}%`, 
                          background: stage.color,
                          borderRadius: "4px",
                          transition: "width 0.3s ease"
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Conversion Rates Summary */}
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", 
                gap: "12px",
                marginTop: "20px",
                padding: "16px",
                background: "#f9fafb",
                borderRadius: "8px"
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "700", color: "#8b5cf6" }}>
                    {leanMetrics.conversionRates.viewToSelect}%
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>View → Select</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "700", color: "#ec4899" }}>
                    {leanMetrics.conversionRates.selectToCapture}%
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>Select → Capture</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "700", color: "#22c55e" }}>
                    {leanMetrics.conversionRates.captureToDownload}%
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>Capture → Download</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "700", color: "#3b82f6" }}>
                    {leanMetrics.conversionRates.overallConversion}%
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>Overall</div>
                </div>
              </div>
            </div>

            {/* Active Users */}
            <div 
              style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(3, 1fr)", 
                gap: "16px",
                marginBottom: "32px"
              }}
            >
              <div className="admin-card" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#3b82f6" }}>
                  {leanMetrics.dailyActiveUsers}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>DAU (Today)</div>
              </div>
              <div className="admin-card" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#8b5cf6" }}>
                  {leanMetrics.weeklyActiveUsers}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>WAU (7 Days)</div>
              </div>
              <div className="admin-card" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#22c55e" }}>
                  {leanMetrics.monthlyActiveUsers}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>MAU (30 Days)</div>
              </div>
            </div>
          </>
        )}

        {/* Charts Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          {/* Top Frames */}
          <div className="admin-card" style={{ padding: "24px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "#fef3c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#f59e0b",
                }}
              >
                <TrendingUp size={20} />
              </div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#222",
                  margin: 0,
                }}
              >
                Top Performing Frames
              </h3>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {(leanMetrics?.topFrames && leanMetrics.topFrames.length > 0) ? (
                leanMetrics.topFrames.map((frame, index) => (
                <div
                  key={frame.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px",
                    background: "#faf6f5",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "6px",
                      background: "var(--accent)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px",
                      fontWeight: "700",
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#222",
                        marginBottom: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {frame.name}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {frame.uniqueUsers} users • {frame.downloads} downloads
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        color: "#222",
                      }}
                    >
                      {formatNumber(frame.views)}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      selects
                    </div>
                  </div>
                </div>
              ))
              ) : (
                <div style={{ 
                  padding: "24px", 
                  textAlign: "center", 
                  color: "var(--text-secondary)",
                  fontSize: "14px" 
                }}>
                  Belum ada data frame. Data akan muncul setelah user memilih frame.
                </div>
              )}
            </div>
          </div>

          {/* Category Distribution */}
          <div className="admin-card" style={{ padding: "24px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "#e0e7ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6366f1",
                }}
              >
                <PieChart size={20} />
              </div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#222",
                  margin: 0,
                }}
              >
                Category Distribution
              </h3>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {analytics.categoryStats.map((cat) => (
                <div key={cat.category}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "#222",
                      }}
                    >
                      {cat.category}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {cat.percentage}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      background: "#f3f4f6",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${cat.percentage}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, var(--accent) 0%, #d4a193 100%)`,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Users & Recent Activity */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          {/* Top Users by Frame Usage */}
          <div className="admin-card" style={{ padding: "24px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "#dbeafe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#3b82f6",
                }}
              >
                <Users size={20} />
              </div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#222",
                  margin: 0,
                }}
              >
                Top Users by Frame Usage
              </h3>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {analytics.topUsers.map((user, index) => (
                <div
                  key={user.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px",
                    background: "#faf6f5",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, var(--accent) 0%, #d4a193 100%)`,
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      fontWeight: "700",
                      flexShrink: 0,
                    }}
                  >
                    {user.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#222",
                        marginBottom: "2px",
                      }}
                    >
                      {user.name}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {user.framesUsed} frames used •{" "}
                      {formatNumber(user.totalViews)} views
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="admin-card" style={{ padding: "24px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "#dcfce7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#16a34a",
                }}
              >
                <Activity size={20} />
              </div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#222",
                  margin: 0,
                }}
              >
                Recent Activity
              </h3>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {analytics.recentActivity.map((activity, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "start",
                    gap: "12px",
                    padding: "12px",
                    background: "#faf6f5",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background:
                        activity.type === "view"
                          ? "#dbeafe"
                          : activity.type === "download"
                          ? "#e9d5ff"
                          : "#fce7f3",
                      color:
                        activity.type === "view"
                          ? "#3b82f6"
                          : activity.type === "download"
                          ? "#8b5cf6"
                          : "#ec4899",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {activity.type === "view" && <Eye size={16} />}
                    {activity.type === "download" && <Download size={16} />}
                    {activity.type === "like" && <Heart size={16} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#222",
                        marginBottom: "2px",
                      }}
                    >
                      <strong>{activity.user}</strong>{" "}
                      {activity.type === "view" && "viewed"}
                      {activity.type === "download" && "downloaded"}
                      {activity.type === "like" && "liked"}{" "}
                      <strong>{activity.frame}</strong>
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {activity.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({ icon, label, value, trend, color, subtitle }) {
  const getTrendIcon = (trend) => {
    if (trend > 0) return <ArrowUp size={14} />;
    if (trend < 0) return <ArrowDown size={14} />;
    return <Minus size={14} />;
  };

  const getTrendColor = (trend) => {
    if (trend > 0) return "#22c55e";
    if (trend < 0) return "#ef4444";
    return "#6b7280";
  };

  return (
    <div className="admin-card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "start", gap: "16px" }}>
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "12px",
            background: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: color,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              marginBottom: "6px",
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: "800",
              color: "#222",
              lineHeight: 1,
              marginBottom: "8px",
            }}
          >
            {value}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginBottom: trend !== undefined ? "8px" : "0",
              }}
            >
              {subtitle}
            </div>
          )}
          {trend !== undefined && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                fontWeight: "600",
                color: getTrendColor(trend),
              }}
            >
              {getTrendIcon(trend)}
              <span>{Math.abs(trend).toFixed(1)}% vs last period</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
