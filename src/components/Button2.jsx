import * as React from "react";
import { PlasmicButton2 } from "./plasmic/baryon/PlasmicButton2";

function Button2_(props, ref) {
  const { plasmicProps } = PlasmicButton2.useBehavior(props, ref);
  return <PlasmicButton2 {...plasmicProps} />;
}

const Button2 = React.forwardRef(Button2_);

export default Object.assign(Button2, { __plumeType: "button" });
