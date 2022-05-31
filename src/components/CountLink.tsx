import { Link } from "gatsby";
import React, { FC } from "react";
import { Pill, Status } from "@fluentui/react-northstar";

interface Props {
  fieldValue: string;
  totalCount: number;
  to: string;
}

const CountLink: FC<Props> = ({ fieldValue, totalCount, to }) => {
  return (
    <Link to={to}>
      <Pill
        actionable
        icon={<Status size="larger" icon={totalCount} state="success" />}
      >
        {fieldValue}
      </Pill>
    </Link>
  );
};

export default CountLink;
