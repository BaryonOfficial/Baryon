// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function Icon4Icon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 25 23"}
      height={"1em"}
      width={"1em"}
      style={{
        fill: "currentcolor",
        ...(style || {}),
      }}
      className={classNames("plasmic-default__svg", className)}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={
          "M22.922 13.078l2.052-9.028a1.042 1.042 0 00-1.016-1.272H6.91L6.512.833A1.042 1.042 0 005.492 0h-4.45C.466 0 0 .466 0 1.042v.694c0 .575.466 1.042 1.042 1.042h3.033l3.049 14.906a2.429 2.429 0 001.21 4.538 2.43 2.43 0 001.7-4.166h9.099a2.43 2.43 0 102.76-.452l.24-1.054a1.042 1.042 0 00-1.016-1.272H9.467l-.284-1.39h12.723c.486 0 .908-.336 1.016-.81z"
        }
        fill={"currentColor"}
      ></path>
    </svg>
  );
}

export default Icon4Icon;
/* prettier-ignore-end */
