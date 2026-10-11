"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

function useSubmit() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const submit = async (fn: () => Promise<unknown>, ok: string, form?: HTMLFormElement) => {
    try {
      await fn();
      setMsg({ tone: "success", text: ok });
      form?.reset();
      router.refresh();
    } catch (e) {
      setMsg({ tone: "danger", text: errorText(e) });
    }
  };
  return { msg, submit };
}

export function SettingsForm({ initial }: { initial: { registrationOpen: boolean; maintenanceBanner: string; practiceEnabled: boolean; dailyChallengeEnabled: boolean; maxInstancesPerSubject: number; publishRequiresReview: boolean } }) {
  const { msg, submit } = useSubmit();
  return (
    <Card>
      <CardHeader><CardTitle>General</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void submit(() => api("/api/v1/admin/settings", { method: "PATCH", body: {
            registrationOpen: f.get("registrationOpen") === "on", practiceEnabled: f.get("practiceEnabled") === "on",
            dailyChallengeEnabled: f.get("dailyChallengeEnabled") === "on", publishRequiresReview: f.get("publishRequiresReview") === "on",
            maintenanceBanner: String(f.get("maintenanceBanner") ?? ""), maxInstancesPerSubject: Number(f.get("maxInstancesPerSubject")),
          } }), "Settings saved.");
        }}>
          {msg && <Alert tone={msg.tone} className="md:col-span-2">{msg.text}</Alert>}
          <Checkbox name="registrationOpen" defaultChecked={initial.registrationOpen} label="Allow self-registration" />
          <Checkbox name="publishRequiresReview" defaultChecked={initial.publishRequiresReview} label="Require review approval before publishing challenges" />
          <Checkbox name="practiceEnabled" defaultChecked={initial.practiceEnabled} label="Practice arenas enabled" />
          <Checkbox name="dailyChallengeEnabled" defaultChecked={initial.dailyChallengeEnabled} label="Daily practice challenge on dashboards" />
          <Field label="Max concurrent instances per participant/team" htmlFor="maxInst"><Input id="maxInst" name="maxInstancesPerSubject" type="number" min={1} max={10} defaultValue={initial.maxInstancesPerSubject} /></Field>
          <Field label="Maintenance banner (blank = none)" htmlFor="banner"><Input id="banner" name="maintenanceBanner" maxLength={280} defaultValue={initial.maintenanceBanner} /></Field>
          <Button type="submit" className="w-fit">Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface Env { id: string; key: string; name: string; description: string; image: string; protocol: string; internalPort: number; memoryMb: number; cpuMillis: number; pidsLimit: number; ttlMinutes: number; enabled: boolean }

export function EnvironmentToggle({ env }: { env: Env }) {
  const router = useRouter();
  return (
    <Checkbox aria-label={`Enable ${env.key}`} label="" checked={env.enabled} onChange={async (e) => {
      const enabled = e.target.checked;
      if (enabled && !confirm(`Enable ${env.image}? Only enable images that have been reviewed and whose isolation has been tested.`)) return;
      const { id: _id, ...rest } = env;
      try {
        await api(`/api/v1/admin/environments/${env.id}`, { method: "PATCH", body: { key: rest.key, name: rest.name, description: rest.description, image: rest.image, protocol: rest.protocol, internalPort: rest.internalPort, memoryMb: rest.memoryMb, cpuMillis: rest.cpuMillis, pidsLimit: rest.pidsLimit, ttlMinutes: rest.ttlMinutes, enabled } });
      } catch (err) {
        alert(errorText(err));
      }
      router.refresh();
    }} />
  );
}

export function EnvironmentForm() {
  const { msg, submit } = useSubmit();
  return (
    <form className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-4" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      void submit(() => api("/api/v1/admin/environments", { method: "POST", body: {
        key: f.get("key"), name: f.get("name"), image: f.get("image"), protocol: f.get("protocol"), internalPort: Number(f.get("internalPort")),
        memoryMb: Number(f.get("memoryMb")), cpuMillis: Number(f.get("cpuMillis")), pidsLimit: Number(f.get("pidsLimit")), ttlMinutes: Number(f.get("ttlMinutes")), enabled: false,
      } }), "Environment added (disabled).", form);
    }}>
      <p className="text-sm font-medium md:col-span-4">Add environment</p>
      {msg && <Alert tone={msg.tone} className="md:col-span-4">{msg.text}</Alert>}
      <Field label="Key" htmlFor="ekey"><Input id="ekey" name="key" required pattern="[a-z0-9-]{3,40}" /></Field>
      <Field label="Name" htmlFor="ename"><Input id="ename" name="name" required /></Field>
      <Field label="Image" htmlFor="eimage"><Input id="eimage" name="image" required placeholder="cyberquest/chal-xyz:1.0" className="font-mono" /></Field>
      <Field label="Protocol" htmlFor="eproto"><Select id="eproto" name="protocol"><option>http</option><option>tcp</option></Select></Field>
      <Field label="Internal port" htmlFor="eport"><Input id="eport" name="internalPort" type="number" required defaultValue={8080} /></Field>
      <Field label="Memory (MB)" htmlFor="emem"><Input id="emem" name="memoryMb" type="number" defaultValue={128} /></Field>
      <Field label="CPU (millicores)" htmlFor="ecpu"><Input id="ecpu" name="cpuMillis" type="number" defaultValue={250} /></Field>
      <Field label="PIDs limit" htmlFor="epids"><Input id="epids" name="pidsLimit" type="number" defaultValue={64} /></Field>
      <Field label="TTL (minutes)" htmlFor="ettl"><Input id="ettl" name="ttlMinutes" type="number" defaultValue={30} /></Field>
      <Button type="submit" className="self-end">Add</Button>
    </form>
  );
}

export function InstitutionForm() {
  const { msg, submit } = useSubmit();
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      void submit(() => api("/api/v1/admin/institutions", { method: "POST", body: { name: f.get("name"), slug: f.get("slug"), domain: f.get("domain") || null } }), "Institution added.", form);
    }}>
      {msg && <Alert tone={msg.tone} className="w-full">{msg.text}</Alert>}
      <Field label="Name" htmlFor="iname"><Input id="iname" name="name" required /></Field>
      <Field label="Slug" htmlFor="islug"><Input id="islug" name="slug" required pattern="[a-z0-9-]{2,60}" /></Field>
      <Field label="Email domain (optional)" htmlFor="idomain"><Input id="idomain" name="domain" /></Field>
      <Button type="submit">Add institution</Button>
    </form>
  );
}

export function AchievementForm() {
  const { msg, submit } = useSubmit();
  return (
    <form className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-3" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      let criteria: unknown;
      try {
        criteria = JSON.parse(String(f.get("criteria")));
      } catch {
        return alert("Criteria must be valid JSON.");
      }
      void submit(() => api("/api/v1/admin/achievements", { method: "POST", body: { key: f.get("key"), name: f.get("name"), description: f.get("description"), xp: Number(f.get("xp")), scope: f.get("scope"), criteria, enabled: true } }), "Achievement created.", form);
    }}>
      <p className="text-sm font-medium md:col-span-3">Add achievement</p>
      {msg && <Alert tone={msg.tone} className="md:col-span-3">{msg.text}</Alert>}
      <Field label="Key" htmlFor="akey"><Input id="akey" name="key" required /></Field>
      <Field label="Name" htmlFor="aname"><Input id="aname" name="name" required /></Field>
      <Field label="XP" htmlFor="axp"><Input id="axp" name="xp" type="number" defaultValue={50} /></Field>
      <Field label="Description" htmlFor="adesc2" className="md:col-span-2"><Input id="adesc2" name="description" required /></Field>
      <Field label="Scope" htmlFor="ascope"><Select id="ascope" name="scope"><option>USER</option><option>TEAM</option></Select></Field>
      <Field label="Criteria JSON" htmlFor="acrit" className="md:col-span-3" hint='Types: first_blood{count}, total_solves{count}, category_solves{category,count}, all_categories{categories,minEach}, streak_days{days}, hintless_solves{count}, team_contributors{minMembers}'>
        <Textarea id="acrit" name="criteria" rows={2} defaultValue='{"type":"total_solves","count":10}' />
      </Field>
      <Button type="submit" className="w-fit">Create</Button>
    </form>
  );
}
