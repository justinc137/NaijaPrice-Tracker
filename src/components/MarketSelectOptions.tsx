import React from "react";
import type { MarketMeta } from "../types/market";
import { groupMarketsByRegion } from "../utils/marketHelpers";

interface MarketSelectOptionsProps {
  markets: MarketMeta[];
  includeStateSuffix?: boolean;
}

export const MarketSelectOptions: React.FC<MarketSelectOptionsProps> = ({
  markets,
  includeStateSuffix = false,
}) => {
  const groups = groupMarketsByRegion(markets);
  return (
    <>
      {groups.map((grp) => (
        <optgroup key={grp.region} label={grp.region}>
          {grp.markets.map((m) => (
            <option key={m.id} value={m.id}>
              {includeStateSuffix ? `${m.name} (${m.state})` : m.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
};
