import type { NextConfig } from 'next';

// Giao diện chuyển mọi yêu cầu /api/... sang máy chủ nghiệp vụ, để trình duyệt chỉ làm việc với một địa chỉ.
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
