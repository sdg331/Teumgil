"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronRight,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  Store as StoreIcon,
  MessageSquareText,
  Sprout,
} from "lucide-react";
import { api, ApiError, useApi, useSession } from "../../lib/client";
import type { CartResponse, Market, Store } from "../../lib/contracts";
import { Button, EmptyState, Modal, Notice, PageHeading, Panel } from "../ui";
import {
  BackLink,
  ReadState,
  rememberMarket,
  SampleNote,
  shortName,
  prettyDate,
  SaveError,
} from "./shared";
import "./citizen.css";

function SearchForm({
  value,
  onSearch,
  label,
  placeholder,
}: {
  value: string;
  onSearch: (q: string) => void;
  label: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState({ source: value, input: value });
  if (draft.source !== value) setDraft({ source: value, input: value });
  const input = draft.source === value ? draft.input : value;
  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(input.trim());
  }
  return (
    <form className="citizen-search" onSubmit={submit} role="search">
      <label htmlFor="catalog-search">{label}</label>
      <div className="citizen-search-control">
        <Search size={21} aria-hidden="true" />
        <input
          id="catalog-search"
          type="search"
          value={input}
          onChange={(e) => setDraft({ source: value, input: e.target.value })}
          maxLength={100}
          placeholder={placeholder}
          autoComplete="off"
        />
        <Button type="submit">검색</Button>
      </div>
    </form>
  );
}

export function HomeScreen() {
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const { user } = useSession();
  const markets = useApi<{ markets: Market[] }>(
    `/api/markets?q=${encodeURIComponent(query)}`,
  );
  const cart = useApi<CartResponse>(user ? "/api/cart" : null);
  const itemQuery = params.get("item");
  function search(q: string) {
    const search = new URLSearchParams(params.toString());
    if (q) search.set("q", q);
    else search.delete("q");
    window.history.replaceState(
      null,
      "",
      "/" + (search.size ? "?" + search.toString() : ""),
    );
  }
  return (
    <div className="citizen-page citizen-home">
      <section className="citizen-home-intro">
        <p className="citizen-kicker">함께 쓰는 시장, 함께 만드는 길</p>
        <h1 tabIndex={-1}>
          오늘의 장보기,
          <br />
          <span>가까운 시장에서.</span>
        </h1>
        <p className="citizen-lead">
          필요한 재료를 찾고, 살 것을 차근차근 담아 보세요.
        </p>
        <SearchForm
          value={query}
          onSearch={search}
          label="어느 시장을 찾으세요?"
          placeholder="시장 이름으로 검색해 보세요"
        />
      </section>
      <div className="citizen-home-columns">
        <section aria-labelledby="market-list-title">
          <div className="citizen-section-heading">
            <h2 id="market-list-title">
              {query
                ? `'${query}' 검색 결과`
                : itemQuery
                  ? `'${itemQuery}'을 찾을 시장`
                  : "둘러볼 수 있는 시장"}
            </h2>
            {markets.data && (
              <span className="citizen-count">
                {markets.data.markets.length}곳
              </span>
            )}
          </div>
          <ReadState
            loading={markets.loading && !markets.data}
            error={markets.error}
            retry={markets.reload}
            next="/"
          />
          {markets.data && !markets.error && (
            <div aria-busy={markets.loading}>
              {markets.data.markets.length ? (
                <ul className="citizen-market-list">
                  {markets.data.markets.map((market, index) => (
                    <li key={market.id}>
                      <Link
                        className="citizen-market-card"
                        href={`/markets/${market.id}${itemQuery ? `?q=${encodeURIComponent(itemQuery)}&from=cart` : ""}`}
                        onClick={() => rememberMarket(market.id)}
                      >
                        <div
                          className={`citizen-market-mark market-mark-${index % 2}`}
                          aria-hidden="true"
                        >
                          <StoreIcon strokeWidth={1.4} size={42} />
                        </div>
                        <div>
                          <span className="citizen-overline">
                            {market.isSample ? "가상 시장" : "시장"}
                          </span>
                          <h3>{shortName(market.name)}</h3>
                          <p>
                            {market.locationDescription ?? "위치 정보 미확인"}
                          </p>
                        </div>
                        <ChevronRight size={21} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="검색 결과가 없어요"
                  description="다른 시장 이름으로 다시 검색해 보세요."
                  action={
                    <Button variant="secondary" onClick={() => search("")}>
                      전체 시장 보기
                    </Button>
                  }
                />
              )}
            </div>
          )}
          <SampleNote />
        </section>
        <aside className="citizen-shopping-preview">
          <ShoppingBag size={29} strokeWidth={1.5} aria-hidden="true" />
          <h2>
            {cart.data?.items.length
              ? "장보기를 이어가 볼까요?"
              : "살 재료, 잊지 않도록"}
          </h2>
          {cart.data?.items.length ? (
            <>
              <p>
                {cart.data.items.length}개 중{" "}
                {cart.data.items.filter((i) => i.checked).length}개를
                체크했어요.
              </p>
              <div className="citizen-preview-items">
                {cart.data.items.slice(0, 3).map((item) => (
                  <span
                    key={item.id}
                    className={item.checked ? "is-checked" : ""}
                  >
                    <Check size={14} aria-hidden="true" />
                    {item.name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p>
              메뉴를 고르지 않아도 괜찮아요.
              <br />
              필요한 재료를 바로 적어 보세요.
            </p>
          )}
          <Link href="/cart" className="citizen-arrow-link">
            장바구니 열기 <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </aside>
      </div>
      <div className="citizen-home-footnote">
        <Sprout size={20} aria-hidden="true" />
        <p>장보기는 편하게. 길에서 겪은 불편은 필요할 때만 알려 주세요.</p>
      </div>
    </div>
  );
}

export function MarketScreen({ id }: { id: string }) {
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const catalog = useApi<{ market: Market; stores: Store[] }>(
    `/api/markets/${encodeURIComponent(id)}/stores?q=${encodeURIComponent(query)}`,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  useEffect(() => {
    if (catalog.data) rememberMarket(id);
  }, [catalog.data, id]);
  function search(q: string) {
    setSelected(null);
    const search = new URLSearchParams(params.toString());
    if (q) search.set("q", q);
    else search.delete("q");
    window.history.replaceState(
      null,
      "",
      `/markets/${id}` + (search.size ? "?" + search.toString() : ""),
    );
  }
  const picked = catalog.data?.stores.find((s) => s.id === selected);
  const back = params.get("from") === "cart" ? "/cart" : "/";
  return (
    <div className="citizen-page">
      <BackLink href={back}>
        {back === "/cart" ? "장바구니로" : "시장 둘러보기"}
      </BackLink>
      <PageHeading
        eyebrow="시장에서 찾기"
        title={
          catalog.data
            ? shortName(catalog.data.market.name)
            : "시장을 불러오는 중"
        }
        description="평소 취급하는 재료를 살펴보세요."
        actions={
          <Link href="/" className="button button-secondary">
            시장 바꾸기
          </Link>
        }
      />
      <SearchForm
        value={query}
        onSearch={search}
        label="점포 또는 재료 검색"
        placeholder="예: 대파, 두부, 점포 이름"
      />
      <ReadState
        loading={catalog.loading && !catalog.data}
        error={catalog.error}
        retry={catalog.reload}
        next={`/markets/${id}`}
      />
      {catalog.data && !catalog.error && (
        <>
          <div className="citizen-catalog-layout">
            <section aria-labelledby="store-results">
              <div className="citizen-section-heading">
                <h2 id="store-results">
                  {query ? `'${query}' 취급 점포` : "점포 둘러보기"}
                </h2>
                <span className="citizen-count">
                  {catalog.data.stores.length}곳
                </span>
              </div>
              <p className="citizen-subtle">
                평소 취급 품목이에요. 당일 재고·가격은 미확인이에요.
              </p>
              <div aria-busy={catalog.loading}>
                {catalog.data.stores.length ? (
                  <ul className="citizen-store-list">
                    {catalog.data.stores.map((store) => (
                      <li
                        key={store.id}
                        className={selected === store.id ? "is-selected" : ""}
                      >
                        <button
                          type="button"
                          className="citizen-store-select"
                          onClick={() => {
                            setSelected(store.id);
                            setMobilePreview(
                              window.matchMedia("(max-width: 700px)").matches,
                            );
                          }}
                          aria-pressed={selected === store.id}
                        >
                          <span className="citizen-store-icon">
                            <StoreIcon
                              size={24}
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                          </span>
                          <span className="citizen-store-text">
                            <strong>{shortName(store.name)}</strong>
                            <span>
                              <MapPin size={13} aria-hidden="true" />
                              {store.locationDescription ?? "위치 미확인"}
                            </span>
                            <span className="citizen-items">
                              {store.usualItems.join(" · ")}
                            </span>
                          </span>
                          <ChevronRight size={19} aria-hidden="true" />
                        </button>
                        <div className="citizen-store-meta">
                          <span>
                            {store.source ?? "출처 미확인"} · 확인일{" "}
                            {store.checkedAt
                              ? prettyDate(store.checkedAt)
                              : "미확인"}
                          </span>
                          <Link
                            href={`/stores/${store.id}?marketId=${id}&q=${encodeURIComponent(query)}${params.get("from") === "cart" ? "&from=cart" : ""}`}
                          >
                            상세 보기
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="이 시장에서 찾지 못했어요"
                    description="다른 재료나 점포 이름으로 검색해 보세요."
                    action={
                      <Button variant="secondary" onClick={() => search("")}>
                        점포 전체 보기
                      </Button>
                    }
                  />
                )}
              </div>
            </section>
            <aside className="citizen-context-panel">
              <div className="citizen-context-heading">
                <MapPin size={21} aria-hidden="true" />
                <h2>{picked ? "선택한 점포" : "목록으로 편하게 찾아요"}</h2>
              </div>
              {picked ? (
                <div className="citizen-selected-store">
                  <p className="citizen-overline">
                    {shortName(catalog.data.market.name)}
                  </p>
                  <h3>{shortName(picked.name)}</h3>
                  <p>
                    {picked.locationDescription ?? "아직 위치 정보가 없어요."}
                  </p>
                  <div className="citizen-item-pills">
                    {picked.usualItems.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <Link
                    href={`/stores/${picked.id}?marketId=${id}&q=${encodeURIComponent(query)}${params.get("from") === "cart" ? "&from=cart" : ""}`}
                    className="button button-primary"
                  >
                    점포 자세히 보기 <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <>
                  <p>
                    점포를 선택하면 취급 품목과 위치 설명을 여기서 볼 수 있어요.
                  </p>
                  <p className="citizen-map-unavailable">
                    실제 지도는 아직 연결되지 않았어요. 위치를 추정해 표시하지
                    않아요.
                  </p>
                </>
              )}
              <div className="citizen-report-link">
                <MessageSquareText size={22} aria-hidden="true" />
                <div>
                  <h3>이 길에서 불편을 겪으셨나요?</h3>
                  <p>위치와 상황을 적어 틈길에 알려 주세요.</p>
                  <Link
                    href={`/opinions/new?marketId=${id}${picked?.locationDescription ? `&location=${encodeURIComponent(picked.locationDescription)}` : ""}`}
                    className="text-link"
                  >
                    틈길에 알리기 <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </aside>
          </div>
          {catalog.data.market.isSample && <SampleNote />}
          <Modal
            open={mobilePreview && !!picked}
            onClose={() => setMobilePreview(false)}
            title={picked ? shortName(picked.name) : "선택한 점포"}
            description={picked?.locationDescription ?? "위치 정보 미확인"}
          >
            {picked && (
              <div className="citizen-selected-store">
                <p>평소 취급 품목</p>
                <div className="citizen-item-pills">
                  {picked.usualItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <p className="citizen-subtle">
                  당일 재고와 가격은 미확인이에요.
                </p>
                <Link
                  href={`/stores/${picked.id}?marketId=${id}&q=${encodeURIComponent(query)}${params.get("from") === "cart" ? "&from=cart" : ""}`}
                  className="button button-primary"
                >
                  점포 자세히 보기 <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </div>
            )}
          </Modal>
        </>
      )}
    </div>
  );
}

export function StoreScreen({ id }: { id: string }) {
  const params = useSearchParams();
  const marketId = params.get("marketId");
  const source = useApi<{ store: Store }>(
    `/api/stores/${encodeURIComponent(id)}${marketId ? `?marketId=${encodeURIComponent(marketId)}` : ""}`,
  );
  const { user } = useSession();
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const back = marketId
    ? `/markets/${marketId}?q=${encodeURIComponent(params.get("q") ?? "")}${params.get("from") === "cart" ? "&from=cart" : ""}`
    : "/";
  async function add(name: string) {
    setAdding(name);
    setError(null);
    setMessage("");
    try {
      const result = await api<{ duplicate: boolean }>("/api/cart", {
        method: "POST",
        headers: { "X-Teumgil-Account": user?.id ?? "" },
        body: { name },
      });
      setAdded((items) => [...items, name]);
      setMessage(
        result.duplicate
          ? `'${name}'은 이미 장바구니에 있어요.`
          : `'${name}'을 장바구니에 담았어요.`,
      );
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setAdding(null);
    }
  }
  return (
    <div className="citizen-page citizen-narrow">
      <BackLink href={back}>점포 목록으로</BackLink>
      <ReadState
        loading={source.loading && !source.data}
        error={source.error}
        retry={source.reload}
        next={`/stores/${id}`}
      />
      {source.data && !source.error && (
        <>
          <div className="citizen-store-hero">
            <span className="citizen-store-emblem">
              <StoreIcon size={38} strokeWidth={1.3} aria-hidden="true" />
            </span>
            <p className="citizen-overline">
              {source.data.store.isSample ? "가상 점포" : "점포 정보"}
            </p>
            <h1 tabIndex={-1}>{shortName(source.data.store.name)}</h1>
            <p>
              <MapPin size={16} aria-hidden="true" />
              {source.data.store.locationDescription ?? "위치 정보 미확인"}
            </p>
          </div>
          <section aria-labelledby="usual-items">
            <div className="citizen-section-heading">
              <h2 id="usual-items">평소 취급 품목</h2>
              <Link href="/cart" className="text-link">
                장바구니 <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="citizen-subtle">필요한 재료를 담아 보세요.</p>
            <ul className="citizen-product-list">
              {source.data.store.usualItems.map((name) => (
                <li key={name}>
                  <span className="citizen-product-name">{name}</span>
                  {user ? (
                    <Button
                      variant={added.includes(name) ? "secondary" : "primary"}
                      loading={adding === name}
                      disabled={adding !== null}
                      onClick={() => add(name)}
                      aria-label={`${name} 담기`}
                    >
                      {added.includes(name) ? (
                        <Check size={17} aria-hidden="true" />
                      ) : (
                        <Plus size={17} aria-hidden="true" />
                      )}
                      {added.includes(name) ? "담았어요" : "담기"}
                    </Button>
                  ) : (
                    <Link
                      href={`/login?next=${encodeURIComponent(`/stores/${id}?marketId=${source.data!.store.marketId}`)}`}
                      className="button button-secondary"
                      aria-label={`${name} 담으려면 로그인`}
                    >
                      로그인 후 담기
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <div aria-live="polite">
              {message && <Notice variant="success">{message}</Notice>}
            </div>
            {error && (
              <SaveError
                message={error.message}
                expired={error.status === 401}
              />
            )}
          </section>
          <Panel className="citizen-provenance">
            <h2>알아두세요</h2>
            <dl>
              <div>
                <dt>재고</dt>
                <dd>미확인</dd>
              </div>
              <div>
                <dt>가격</dt>
                <dd>미확인</dd>
              </div>
              <div>
                <dt>정보 출처</dt>
                <dd>{source.data.store.source ?? "미확인"}</dd>
              </div>
              <div>
                <dt>확인일</dt>
                <dd>
                  {source.data.store.checkedAt
                    ? prettyDate(source.data.store.checkedAt)
                    : "미확인"}
                </dd>
              </div>
            </dl>
            <p>평소 취급 품목이 당일 판매나 재고를 보장하지 않아요.</p>
          </Panel>
          {source.data.store.isSample && <SampleNote />}
        </>
      )}
    </div>
  );
}
