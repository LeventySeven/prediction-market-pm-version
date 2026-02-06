import React from "react";
import { Composition } from "remotion";
import UiAnimation from "./UiAnimation";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="UiAnimation"
      component={UiAnimation}
      durationInFrames={225}
      fps={30}
      width={1200}
      height={720}
    />
  </>
);

