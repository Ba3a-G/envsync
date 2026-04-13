import { Copy, Download, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function copyToClipboard(value: string, label: string) {
  navigator.clipboard.writeText(value);
  toast.success(`${label} copied`);
}

function downloadText(filename: string, value: string) {
  const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const MyCertificatesCard = () => {
  const { data, isLoading, error } = api.certificates.getMyCertificateBundle();

  return (
    <Card className="border-gray-800 bg-gray-900/70">
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2 ring-1 ring-violet-500/20">
            <ShieldCheck className="size-5 text-violet-400" />
          </div>
          <div>
            <CardTitle className="text-base text-gray-100">My Certificates</CardTitle>
            <p className="text-sm text-gray-400">
              System-generated EnvSync certificates for managed vault and PKI flows.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2 text-sm text-gray-400">
          These certificates are separate from the normal certificate manager and cannot be modified there.
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="size-4 animate-spin" />
            Loading certificate bundle...
          </div>
        ) : error || !data ? (
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
            Certificate bundle unavailable right now. Sign in again or ask an org admin to re-provision system certificates.
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2 text-sm text-gray-300">
              <div>Serial: {data.member_certificate.serial_hex}</div>
              <div>Status: {data.member_certificate.status}</div>
              <div>Role: {data.member_certificate.metadata?.role_name ?? "System member"}</div>
              <div className="flex items-center gap-2 text-violet-300">
                <KeyRound className="size-4" />
                <span>System-generated certificate</span>
              </div>
            </div>

            {[
              {
                label: "Root CA PEM",
                value: data.root_ca_pem,
                filename: "envsync-root-ca.pem",
              },
              {
                label: "Member Certificate PEM",
                value: data.member_certificate.cert_pem ?? "",
                filename: "envsync-member-cert.pem",
              },
              {
                label: "Private Key PEM",
                value: data.member_certificate.key_pem,
                filename: "envsync-member-key.pem",
              },
            ].map((entry) => (
              <div key={entry.label} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-200">{entry.label}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-gray-700 text-gray-300 hover:bg-gray-800"
                      onClick={() => copyToClipboard(entry.value, entry.label)}
                    >
                      <Copy className="mr-2 size-3" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-gray-700 text-gray-300 hover:bg-gray-800"
                      onClick={() => downloadText(entry.filename, entry.value)}
                    >
                      <Download className="mr-2 size-3" />
                      Download
                    </Button>
                  </div>
                </div>
                <Textarea
                  readOnly
                  value={entry.value}
                  className="min-h-[120px] border-gray-800 bg-gray-950 font-mono text-xs text-gray-300"
                />
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
};
