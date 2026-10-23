import json
import os
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]

os.environ.setdefault("AWS_DEFAULT_REGION", "eu-central-1")
os.environ.setdefault("AWS_REGION", "eu-central-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ["FINDS_TABLE"] = "test-finds"
os.environ["CHALLENGES_TABLE"] = "test-challenges"
os.environ["PHOTOS_BUCKET"] = "test-photos"
os.environ["PLAYERS"] = json.dumps(["Bartosz", "Asia"])
os.environ["TREES_FILE"] = str(REPO / "data" / "trees.json")
os.environ["S3_ENDPOINT_URL"] = "https://s3.eu-central-1.amazonaws.com"

sys.path.insert(0, str(ROOT / "api"))


@pytest.fixture
def aws():
    with mock_aws():
        ddb = boto3.client("dynamodb", region_name="eu-central-1")
        ddb.create_table(
            TableName="test-finds",
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[
                {"AttributeName": "tree_id", "KeyType": "HASH"},
                {"AttributeName": "find_id", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "tree_id", "AttributeType": "S"},
                {"AttributeName": "find_id", "AttributeType": "S"},
            ],
        )
        ddb.create_table(
            TableName="test-challenges",
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "challenge_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "challenge_id", "AttributeType": "S"}],
        )
        s3 = boto3.client("s3", region_name="eu-central-1")
        s3.create_bucket(Bucket="test-photos", CreateBucketConfiguration={"LocationConstraint": "eu-central-1"})

        import handler

        # The module creates its clients at import time; point them at the mocks.
        handler._dynamodb = boto3.resource("dynamodb", region_name="eu-central-1")
        handler.finds_table = handler._dynamodb.Table("test-finds")
        handler.challenges_table = handler._dynamodb.Table("test-challenges")
        handler._s3 = s3
        yield handler
