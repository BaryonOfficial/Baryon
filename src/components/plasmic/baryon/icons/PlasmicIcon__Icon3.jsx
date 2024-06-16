// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function Icon3Icon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 25 25"}
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
          "M12.11 0C5.42 0 0 5.42 0 12.11c0 6.689 5.42 12.109 12.11 12.109 6.689 0 12.109-5.42 12.109-12.11C24.219 5.42 18.799 0 12.109 0zm0 4.688a4.297 4.297 0 110 8.593 4.297 4.297 0 010-8.594zm0 16.796a9.357 9.357 0 01-7.154-3.33c.918-1.728 2.715-2.92 4.81-2.92.117 0 .234.02.346.054a6.464 6.464 0 001.997.337 6.44 6.44 0 001.997-.337c.113-.034.23-.054.347-.054 2.095 0 3.892 1.192 4.81 2.92a9.357 9.357 0 01-7.154 3.33z"
        }
        fill={"currentColor"}
      ></path>
    </svg>
  );
}

export default Icon3Icon;
/* prettier-ignore-end */
