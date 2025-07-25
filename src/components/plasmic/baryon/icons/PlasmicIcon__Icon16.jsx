// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function Icon16Icon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      viewBox={"0 0 24 24"}
      height={"1em"}
      width={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        fill={"currentColor"}
        d={
          "M12.74 5.47c2.36 1.03 3.61 3.56 3.18 5.99A6.002 6.002 0 0118 16v.17a3 3 0 011-.17 3 3 0 013 3 3 3 0 01-3 3H6a4 4 0 01-4-4 4 4 0 014-4h.27C5 12.45 4.6 10.24 5.5 8.26a5.49 5.49 0 017.24-2.79m-.81 1.83c-1.77-.8-3.84.01-4.62 1.77-.46 1.02-.38 2.15.1 3.06A5.988 5.988 0 0112 10c.7 0 1.38.12 2 .34a3.506 3.506 0 00-2.07-3.04m1.62-3.66c-.55-.24-1.1-.41-1.67-.52l2.49-1.3.9 2.89a7.67 7.67 0 00-1.72-1.07m-7.46.8c-.49.35-.92.75-1.29 1.19l.11-2.81 2.96.68c-.62.21-1.22.53-1.78.94M18 9.71c-.09-.59-.22-1.16-.41-1.71l2.38 1.5-2.05 2.23c.11-.65.13-1.33.08-2.02M3.04 11.3c.07.6.2 1.17.39 1.7l-2.37-1.5L3.1 9.28c-.1.65-.13 1.33-.06 2.02M19 18h-3v-2a4 4 0 00-4-4 4 4 0 00-4 4H6a2 2 0 00-2 2 2 2 0 002 2h13a1 1 0 001-1 1 1 0 00-1-1z"
        }
      ></path>
    </svg>
  );
}

export default Icon16Icon;
/* prettier-ignore-end */
