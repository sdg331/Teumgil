"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { api, ApiError, useApi, useSession } from "../../lib/client";
import type { CartItem, CartResponse } from "../../lib/contracts";
import { Button, EmptyState, Field, Modal, PageHeading } from "../ui";
import { ReadState, SaveError, selectedMarket } from "./shared";
import "./citizen.css";

export function CartScreen() {
  const source = useApi<CartResponse>("/api/cart");
  const baseline =
    source.data?.items.map((item) => item.id + ":" + item.version).join(",") ??
    "unloaded";
  return <CartContent key={baseline} source={source} />;
}

function subscribeMarket(notify: () => void) {
  window.addEventListener("teumgil:market", notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener("teumgil:market", notify);
    window.removeEventListener("storage", notify);
  };
}

function CartContent({
  source,
}: {
  source: ReturnType<typeof useApi<CartResponse>>;
}) {
  const { user } = useSession();
  const accountHeaders = { "X-Teumgil-Account": user?.id ?? "" };
  const [items, setItems] = useState<CartItem[]>(source.data?.items ?? []);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<CartItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const market = useSyncExternalStore(
    subscribeMarket,
    selectedMarket,
    () => null,
  );
  const actual = useRef(
    new Map<string, CartItem>(
      (source.data?.items ?? []).map((item) => [item.id, item]),
    ),
  );
  const desired = useRef(new Map<string, boolean>());
  const working = useRef(new Set<string>());
  const reduced = useReducedMotion();
  const input = useRef<HTMLInputElement>(null);

  function updateItem(item: CartItem) {
    actual.current.set(item.id, item);
    setItems((previous) =>
      previous.map((value) => (value.id === item.id ? item : value)),
    );
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    setFieldError("");
    setError(null);
    setMessage("");
    if (!name.trim()) {
      setFieldError("살 재료를 입력해 주세요.");
      input.current?.focus();
      return;
    }
    setAdding(true);
    try {
      const result = await api<{ item: CartItem; duplicate: boolean }>(
        "/api/cart",
        { method: "POST", headers: accountHeaders, body: { name } },
      );
      actual.current.set(result.item.id, result.item);
      setItems((previous) =>
        previous.some((item) => item.id === result.item.id)
          ? previous
          : [...previous, result.item],
      );
      setName("");
      setMessage(
        result.duplicate
          ? `'${result.item.name}'은 이미 목록에 있어요.`
          : `'${result.item.name}'을 담았어요.`,
      );
      input.current?.focus();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setAdding(false);
    }
  }

  async function toggle(item: CartItem, checked: boolean) {
    desired.current.set(item.id, checked);
    setItems((previous) =>
      previous.map((value) =>
        value.id === item.id ? { ...value, checked } : value,
      ),
    );
    if (working.current.has(item.id)) return;
    working.current.add(item.id);
    setPending(new Set(working.current));
    setError(null);
    try {
      while (
        desired.current.get(item.id) !== actual.current.get(item.id)?.checked
      ) {
        const persisted = actual.current.get(item.id);
        if (!persisted) break;
        const intent = desired.current.get(item.id)!;
        const result = await api<{ item: CartItem }>(`/api/cart/${item.id}`, {
          method: "PATCH",
          headers: accountHeaders,
          body: { version: persisted.version, checked: intent },
        });
        actual.current.set(item.id, result.item);
        setItems((previous) =>
          previous.map((value) =>
            value.id === item.id
              ? {
                  ...result.item,
                  checked: desired.current.get(item.id) ?? result.item.checked,
                }
              : value,
          ),
        );
      }
      const latest = actual.current.get(item.id);
      if (latest)
        setMessage(
          `${latest.name}, ${latest.checked ? "체크했어요." : "체크를 해제했어요."}`,
        );
    } catch (e) {
      const last = actual.current.get(item.id);
      if (last) updateItem(last);
      desired.current.delete(item.id);
      setError(e as ApiError);
      if ((e as ApiError).status === 409) await source.reload();
    } finally {
      working.current.delete(item.id);
      setPending(new Set(working.current));
    }
  }
  function open(item: CartItem) {
    setMenu(item);
    setEditName(item.name);
    setEditing(false);
    setDeleting(false);
    setFieldError("");
    setError(null);
  }
  function close() {
    if (!saving) {
      setMenu(null);
      setEditing(false);
      setDeleting(false);
    }
  }
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!menu) return;
    setFieldError("");
    if (!editName.trim()) {
      setFieldError("재료 이름을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const latest = actual.current.get(menu.id) ?? menu;
      const result = await api<{ item: CartItem }>(`/api/cart/${menu.id}`, {
        method: "PATCH",
        body: { version: latest.version, name: editName },
      });
      updateItem(result.item);
      setMessage(`'${result.item.name}'으로 저장했어요.`);
      setMenu(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!menu) return;
    setSaving(true);
    setError(null);
    try {
      const latest = actual.current.get(menu.id) ?? menu;
      await api(`/api/cart/${menu.id}`, {
        method: "DELETE",
        headers: accountHeaders,
        body: { version: latest.version },
      });
      actual.current.delete(menu.id);
      setItems((previous) => previous.filter((item) => item.id !== menu.id));
      setMessage(`'${menu.name}'을 삭제했어요.`);
      setMenu(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSaving(false);
    }
  }
  const findHref = (item: CartItem) =>
    market
      ? `/markets/${market}?q=${encodeURIComponent(item.name)}&from=cart`
      : `/?choose=market&item=${encodeURIComponent(item.name)}`;
  const checked = items.filter((item) => item.checked).length;
  return (
    <div className="citizen-page citizen-narrow">
      <PageHeading
        eyebrow="잊지 않고 하나씩"
        title="장바구니"
        description="살 재료를 적고, 준비한 재료는 체크해 보세요."
      />
      <ReadState
        loading={source.loading && !source.data}
        error={source.error}
        retry={source.reload}
        next="/cart"
      />
      {source.data && !source.error && (
        <>
          <form onSubmit={add} className="citizen-add-form">
            <Field
              label="살 재료"
              htmlFor="new-ingredient"
              error={!menu ? fieldError : undefined}
            >
              <div className="citizen-add-control">
                <input
                  ref={input}
                  id="new-ingredient"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder="예: 대파, 두부 한 모"
                  aria-invalid={!!fieldError && !menu}
                  aria-describedby={
                    fieldError && !menu ? "new-ingredient-error" : undefined
                  }
                  disabled={adding}
                />
                <Button type="submit" loading={adding}>
                  <Plus size={19} aria-hidden="true" />
                  <span>추가</span>
                </Button>
              </div>
            </Field>
          </form>
          <div className="citizen-section-heading">
            <h2>내 장보기 목록</h2>
            <span className="citizen-count">
              {checked} / {items.length} 체크
            </span>
          </div>
          {items.length > 0 && (
            <div
              className="citizen-cart-progress"
              role="img"
              aria-label={`${items.length}개 중 ${checked}개 체크`}
            >
              <span style={{ width: `${(checked / items.length) * 100}%` }} />
            </div>
          )}
          <div aria-live="polite" className="citizen-live-message">
            {message}
          </div>
          {error && !menu && (
            <SaveError message={error.message} expired={error.status === 401} />
          )}
          <ul className="citizen-cart-list">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.li
                  layout={reduced ? false : "position"}
                  key={item.id}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                  className={item.checked ? "is-checked" : ""}
                >
                  <label className="citizen-check-control">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => void toggle(item, e.target.checked)}
                      aria-label={`${item.name} 체크`}
                    />
                    <span className="citizen-check-box" aria-hidden="true">
                      {item.checked && <Check size={18} strokeWidth={2.6} />}
                    </span>
                    <span className="citizen-cart-item-name">{item.name}</span>
                  </label>
                  {pending.has(item.id) && (
                    <span className="citizen-saving">저장 중</span>
                  )}
                  <button
                    type="button"
                    className="citizen-icon-button"
                    aria-label={`${item.name} 수정 및 삭제`}
                    onClick={() => open(item)}
                    disabled={pending.has(item.id)}
                  >
                    <MoreHorizontal size={21} aria-hidden="true" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {items.length === 0 && (
            <EmptyState
              icon={<ShoppingBag size={36} strokeWidth={1.4} />}
              title="아직 담은 재료가 없어요"
              description="메뉴를 정하지 않아도 괜찮아요. 생각나는 재료부터 하나씩 적어 보세요."
              action={
                <Button
                  variant="secondary"
                  onClick={() => input.current?.focus()}
                >
                  첫 재료 적기
                </Button>
              }
            />
          )}
          <p className="citizen-footnote">
            내 계정에 저장되는 공통 목록이에요. 다른 시장을 둘러봐도 그대로
            유지돼요.
          </p>
          <div className="citizen-cart-tip">
            <Search size={20} aria-hidden="true" />
            <p>
              점포가 궁금한 재료는 <strong>더 보기</strong>에서 취급 점포를
              찾아보세요.
            </p>
          </div>
        </>
      )}
      <Modal
        open={menu !== null}
        onClose={close}
        title={
          deleting
            ? "이 재료를 삭제할까요?"
            : editing
              ? "재료 이름 수정"
              : (menu?.name ?? "재료")
        }
        description={
          deleting
            ? `'${menu?.name ?? ""}'만 목록에서 삭제해요.`
            : editing
              ? "이름이 바뀌면 체크가 해제돼요."
              : undefined
        }
      >
        {error && menu && (
          <SaveError message={error.message} expired={error.status === 401} />
        )}
        {error && menu && (error.status === 409 || error.status === 0) && (
          <Button variant="secondary" type="button" onClick={() => {
            setMenu(null);
            void source.reload();
          }}>수정을 취소하고 최신 목록 보기</Button>
        )}
        {menu &&
          (!editing && !deleting ? (
            <div className="citizen-action-menu">
              <Link href={findHref(menu)}>
                <Search size={19} aria-hidden="true" />
                <span>평소 취급 점포 찾기</span>
                <ChevronRight size={18} />
              </Link>
              <button onClick={() => setEditing(true)}>
                <Pencil size={19} aria-hidden="true" />
                <span>이름 수정하기</span>
                <ChevronRight size={18} />
              </button>
              <button
                className="is-destructive"
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={19} aria-hidden="true" />
                <span>재료 삭제하기</span>
                <ChevronRight size={18} />
              </button>
            </div>
          ) : editing ? (
            <form onSubmit={rename}>
              <Field
                htmlFor="edit-ingredient"
                label="재료 이름"
                error={fieldError}
              >
                <input
                  id="edit-ingredient"
                  aria-describedby={
                    fieldError ? "edit-ingredient-error" : undefined
                  }
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  autoFocus
                  disabled={saving}
                />
              </Field>
              <div className="citizen-form-actions">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={close}
                  disabled={saving}
                >
                  취소
                </Button>
                <Button type="submit" loading={saving}>
                  저장하기
                </Button>
              </div>
            </form>
          ) : (
            <div className="citizen-form-actions">
              <Button variant="secondary" onClick={close} disabled={saving}>
                취소
              </Button>
              <Button variant="danger" loading={saving} onClick={remove}>
                삭제하기
              </Button>
            </div>
          ))}
      </Modal>
    </div>
  );
}
