import { CheckCircle2, Clock, FileCheck2, KeyRound } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface LoginScreenProps {
  onLogin: () => void;
}

const HIGHLIGHTS = [
  {
    icon: FileCheck2,
    title: 'Gửi yêu cầu trong 1 phút',
    description:
      'Chọn đúng danh mục, đính kèm tệp và gửi trực tiếp tới phòng ban phụ trách.',
  },
  {
    icon: Clock,
    title: 'Theo dõi tiến độ minh bạch',
    description: 'Cập nhật trạng thái xử lý và phản hồi theo thời gian thực.',
  },
  {
    icon: CheckCircle2,
    title: 'Một tài khoản duy nhất',
    description:
      'Đăng nhập nhanh bằng tài khoản nhà trường dành cho Sinh viên, Giảng viên và Cán bộ.',
  },
];

export function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <div className="bg-background grid min-h-dvh lg:grid-cols-2">
      {/* Left panel: Focused Login */}
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-3d.png"
              alt="UniRequest"
              className="size-9 object-contain drop-shadow-xs"
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">UniRequest</p>
              <p className="text-muted-foreground text-xs">Cổng dịch vụ Đại học</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-12">
          <Card className="w-full max-w-sm border shadow-sm">
            <CardHeader className="items-center text-center">
              <img
                src="/logo-3d.png"
                alt="UniRequest"
                className="mb-2 size-18 object-contain drop-shadow-sm"
              />
              <CardTitle className="text-xl">Đăng nhập</CardTitle>
              <CardDescription>Sử dụng tài khoản nhà trường để tiếp tục</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" size="lg" className="w-full" onClick={onLogin}>
                <KeyRound className="size-4" />
                <span>Đăng nhập tài khoản trường</span>
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-muted-foreground text-center text-xs lg:text-left">
          UniRequest · Cổng tiếp nhận & xử lý yêu cầu trực tuyến
        </p>
      </div>

      {/* Right panel: Minimal bright showcase */}
      <div className="bg-muted hidden flex-col justify-between border-l p-12 lg:flex">
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Cổng dịch vụ một cửa
          </p>
          <h2 className="max-w-md text-2xl font-semibold tracking-tight">
            Tiếp nhận & xử lý yêu cầu Đại học nhanh gọn, minh bạch
          </h2>
        </div>

        <div className="space-y-3">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="bg-card flex items-start gap-3.5 rounded-xl border p-4 shadow-2xs"
              >
                <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="text-foreground size-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
