import * as React from "react";
import { PlasmicButton3 } from "./plasmic/baryon/PlasmicButton3";

function Button3_(props, ref) {
  const { plasmicProps } = PlasmicButton3.useBehavior(props, ref);
  return <PlasmicButton3 {...plasmicProps} />;
}

const Button3 = React.forwardRef(Button3_);

export default Object.assign(Button3, { __plumeType: "button" });
