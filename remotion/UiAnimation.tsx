import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const COLORS = {
  background: "#050505",
  card: "#0b0b0b",
  border: "#1b1b1f",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  accentPink: "rgba(245,68,166,1)",
  accentGreen: "rgba(190,255,29,1)",
  pill: "#121212",
};

const BASE_FONT = "Inter, system-ui, -apple-system, sans-serif";

type Market = {
  id: string;
  title: string;
  category: string;
  volume: string;
  chance: number;
  time: string;
};

const MARKETS: Market[] = [
  {
    id: "1",
    title: "Will Fortnite release an Epstein skin before 2030?",
    category: "Celebs",
    volume: "$100.00",
    chance: 77,
    time: "16h",
  },
  {
    id: "2",
    title: "Will the Seattle Seahawks win the Superbowl?",
    category: "Sports",
    volume: "$1,110.00",
    chance: 86,
    time: "2d",
  },
  {
    id: "3",
    title: "Epstein creator of Bitcoin?",
    category: "World",
    volume: "$2,258.17",
    chance: 99,
    time: "13h",
  },
  {
    id: "4",
    title: "Elon Musk to buy Ryan Air by 2027?",
    category: "World",
    volume: "$479.24",
    chance: 25,
    time: "32d",
  },
  {
    id: "5",
    title: "Will Bitcoin crash if governments confirm aliens?",
    category: "Crypto",
    volume: "$1,549.42",
    chance: 75,
    time: "16h",
  },
  {
    id: "6",
    title: "Will Michael B. Jordan win Best Actor at Oscars?",
    category: "Celebs",
    volume: "$1,946.00",
    chance: 99,
    time: "38d",
  },
  {
    id: "7",
    title: "Will Bitmap become a network state?",
    category: "Politics",
    volume: "$490.00",
    chance: 81,
    time: "45d",
  },
  {
    id: "8",
    title: "Will Cursor Café open in Seoul by July 2026?",
    category: "World",
    volume: "$311.00",
    chance: 39,
    time: "16h",
  },
];

const Header = ({ progress }: { progress: number }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "18px 24px",
      borderBottom: `1px solid ${COLORS.border}`,
      opacity: interpolate(progress, [0, 1], [0, 1]),
      transform: `translateY(${interpolate(progress, [0, 1], [8, 0])}px)`,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          border: `1px solid ${COLORS.border}`,
          background: "#111111",
        }}
      />
      <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>
        YALLA MARKET
      </div>
    </div>
    <div
      style={{
        width: 320,
        height: 28,
        borderRadius: 999,
        border: `1px solid ${COLORS.border}`,
        background: "#0f0f10",
      }}
    />
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          border: `1px solid ${COLORS.border}`,
        }}
      />
      <div
        style={{
          width: 36,
          height: 26,
          borderRadius: 999,
          border: `1px solid ${COLORS.border}`,
          color: COLORS.text,
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        EN
      </div>
      <div
        style={{
          height: 28,
          padding: "0 12px",
          borderRadius: 999,
          background: COLORS.accentPink,
          color: "#0b0b0b",
          fontSize: 10,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
        }}
      >
        Registration
      </div>
    </div>
  </div>
);

const FilterBar = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 24px",
    }}
  >
    <div style={{ color: COLORS.muted, fontSize: 10, letterSpacing: 2 }}>
      FILTERS
    </div>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 999,
        padding: "6px 12px",
        color: COLORS.text,
        fontSize: 10,
      }}
    >
      Filter
    </div>
  </div>
);

const BottomNav = () => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 12,
      display: "flex",
      justifyContent: "space-around",
      color: COLORS.muted,
      fontSize: 10,
    }}
  >
    <span>Friends</span>
    <span style={{ color: COLORS.text }}>Catalog</span>
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        border: `1px solid ${COLORS.accentPink}`,
        color: COLORS.accentPink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: -8,
        fontWeight: 700,
      }}
    >
      +
    </div>
    <span>My bets</span>
    <span>Profile</span>
  </div>
);

const ChanceBar = ({ percent }: { percent: number }) => (
  <div
    style={{
      width: "100%",
      height: 6,
      borderRadius: 999,
      background: "#151515",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        width: `${percent}%`,
        height: "100%",
        background: COLORS.accentPink,
      }}
    />
  </div>
);

const MarketCard = ({
  market,
  opacity,
  transform,
  highlight,
}: {
  market: Market;
  opacity: number;
  transform: string;
  highlight?: boolean;
}) => (
  <div
    style={{
      borderRadius: 18,
      border: `1px solid ${highlight ? COLORS.accentPink : COLORS.border}`,
      background: COLORS.card,
      padding: 14,
      boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
      opacity,
      transform,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          border: `1px solid ${COLORS.border}`,
          background: "#111111",
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            color: COLORS.text,
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {market.title}
        </div>
        <div
          style={{
            marginTop: 6,
            display: "flex",
            gap: 8,
            color: COLORS.muted,
            fontSize: 9,
          }}
        >
          <span
            style={{
              background: COLORS.pill,
              padding: "2px 6px",
              borderRadius: 999,
              border: `1px solid ${COLORS.border}`,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {market.category}
          </span>
          <span>VOL {market.volume}</span>
          <span>{market.time}</span>
        </div>
      </div>
    </div>
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: COLORS.text,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        <span>{market.chance}%</span>
        <span style={{ color: COLORS.muted, fontSize: 9 }}>CHANCE</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <ChanceBar percent={market.chance} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div
          style={{
            flex: 1,
            height: 28,
            borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 10px",
            fontSize: 10,
            color: COLORS.text,
          }}
        >
          <span>Yes</span>
          <span>{market.chance}%</span>
        </div>
        <div
          style={{
            flex: 1,
            height: 28,
            borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 10px",
            fontSize: 10,
            color: COLORS.text,
          }}
        >
          <span>No</span>
          <span>{100 - market.chance}%</span>
        </div>
      </div>
    </div>
  </div>
);

const LoadingCard = ({ shimmerX }: { shimmerX: number }) => (
  <div
    style={{
      borderRadius: 18,
      border: `1px solid ${COLORS.border}`,
      background: COLORS.card,
      padding: 14,
      position: "relative",
      overflow: "hidden",
      height: "100%",
    }}
  >
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        border: `1px solid ${COLORS.border}`,
        background: "#111111",
        marginBottom: 10,
      }}
    />
    <div
      style={{
        width: "70%",
        height: 10,
        borderRadius: 999,
        background: "#151515",
        marginBottom: 8,
      }}
    />
    <div
      style={{
        width: "50%",
        height: 8,
        borderRadius: 999,
        background: "#121212",
      }}
    />
    <div
      style={{
        position: "absolute",
        top: 0,
        left: shimmerX,
        width: 120,
        height: "100%",
        background:
          "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.06), rgba(255,255,255,0))",
        transform: "skewX(-12deg)",
      }}
    />
  </div>
);

const GridLayout = ({
  renderCard,
}: {
  renderCard: (market: Market, index: number) => React.ReactNode;
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 16,
      padding: "0 24px",
    }}
  >
    {MARKETS.slice(0, 8).map((market, index) => (
      <div key={market.id} style={{ height: 190 }}>
        {renderCard(market, index)}
      </div>
    ))}
  </div>
);

const MainPageScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 } });
  const skeletonFade = interpolate(frame, [0, 18], [1, 0], {
    extrapolateRight: "clamp",
  });
  const contentFade = interpolate(frame, [8, 28], [0, 1], {
    extrapolateRight: "clamp",
  });
  const shimmerX = interpolate(frame, [0, 40], [-140, 320]);

  return (
    <AbsoluteFill
      style={{
        background: COLORS.background,
        color: COLORS.text,
        fontFamily: BASE_FONT,
      }}
    >
      <Header progress={entrance} />
      <FilterBar />
      <div style={{ position: "relative" }}>
        <div style={{ opacity: skeletonFade }}>
          <GridLayout
            renderCard={() => <LoadingCard shimmerX={shimmerX} />}
          />
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: contentFade }}>
          <GridLayout
            renderCard={(market, index) => (
              <MarketCard
                market={market}
                opacity={interpolate(
                  Math.max(0, entrance - index * 0.06),
                  [0, 1],
                  [0, 1]
                )}
                transform={`translateY(${interpolate(
                  Math.max(0, entrance - index * 0.06),
                  [0, 1],
                  [12, 0]
                )}px)`}
              />
            )}
          />
        </div>
      </div>
      <BottomNav />
    </AbsoluteFill>
  );
};

const SelectMarketScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const select = spring({ frame, fps, config: { damping: 200 } });
  const focusOpacity = interpolate(select, [0, 1], [1, 0]);
  const zoom = interpolate(select, [0, 1], [1, 1.12]);
  const chosenIndex = 2;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.background,
        color: COLORS.text,
        fontFamily: BASE_FONT,
      }}
    >
      <Header progress={1} />
      <FilterBar />
      <div
        style={{
          position: "relative",
          padding: "0 24px",
          height: 420,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          {MARKETS.slice(0, 8).map((market, index) => {
            const isSelected = index === chosenIndex;
            const fade = isSelected ? 1 : focusOpacity;
            return (
              <div key={market.id} style={{ height: 190 }}>
                <MarketCard
                  market={market}
                  opacity={fade}
                  transform={isSelected ? `scale(${zoom})` : "scale(1)"}
                  highlight={isSelected}
                />
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </AbsoluteFill>
  );
};

const BetPlacingScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 } });
  const spinnerRotation = interpolate(frame, [0, fps], [0, 360]);

  return (
    <AbsoluteFill
      style={{
        background: COLORS.background,
        color: COLORS.text,
        fontFamily: BASE_FONT,
      }}
    >
      <Header progress={1} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 20,
          padding: "18px 24px",
        }}
      >
        <div>
          <div style={{ marginBottom: 12, fontSize: 12, color: COLORS.muted }}>
            Market
          </div>
          <MarketCard
            market={MARKETS[2]}
            opacity={1}
            transform={`scale(${interpolate(entrance, [0, 1], [0.98, 1])})`}
            highlight
          />
        </div>
        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.card,
            padding: 18,
            height: 260,
            transform: `translateY(${interpolate(
              entrance,
              [0, 1],
              [12, 0]
            )}px)`,
            opacity: interpolate(entrance, [0, 1], [0, 1]),
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Place a bet
          </div>
          <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 12 }}>
            Buying YES at $0.62
          </div>
          <div
            style={{
              height: 38,
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              background: "#0f0f10",
              marginBottom: 12,
            }}
          />
          <div
            style={{
              height: 36,
              borderRadius: 999,
              background: COLORS.accentGreen,
              color: "#0b0b0b",
              fontWeight: 700,
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <span>Placing bet</span>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                border: "2px solid rgba(0,0,0,0.3)",
                borderTopColor: "rgba(0,0,0,0.75)",
                transform: `rotate(${spinnerRotation}deg)`,
              }}
            />
          </div>
        </div>
      </div>
      <BottomNav />
    </AbsoluteFill>
  );
};

export const UiAnimation: React.FC = () => {
  const { fps } = useVideoConfig();
  const sceneDuration = Math.round(2.6 * fps);

  return (
    <AbsoluteFill>
      <Sequence durationInFrames={sceneDuration}>
        <MainPageScene />
      </Sequence>
      <Sequence from={sceneDuration} durationInFrames={sceneDuration}>
        <SelectMarketScene />
      </Sequence>
      <Sequence from={sceneDuration * 2} durationInFrames={sceneDuration}>
        <BetPlacingScene />
      </Sequence>
    </AbsoluteFill>
  );
};

export default UiAnimation;
